using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Windows.Forms;

internal static class Program
{
    private static readonly string StateDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MORS-AEGIS");
    private static readonly string StateFile = Path.Combine(StateDir, "launcher-state.json");
    private static readonly string LogFile = Path.Combine(StateDir, "launcher.log");
    private static Process? backend;

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Directory.CreateDirectory(StateDir);
        bool selfTest = args.Contains("--self-test", StringComparer.OrdinalIgnoreCase);
        using var mutex = new Mutex(false, @"Local\MORS_AEGIS_LAUNCHER");
        bool ownsMutex = false;
        try
        {
            try { ownsMutex = mutex.WaitOne(0); }
            catch (AbandonedMutexException) { ownsMutex = true; }
            if (!ownsMutex)
            {
                var existing = ReadActiveUrl();
                if (existing != null && !selfTest) OpenBrowser(existing);
                return existing != null ? 0 : 4;
            }

            var baseDir = AppContext.BaseDirectory;
            var node = Path.Combine(baseDir, "runtime", "node.exe");
            var app = Path.Combine(baseDir, "app");
            var server = Path.Combine(app, "server.mjs");
            if (!File.Exists(node) || !File.Exists(server))
                throw new InvalidOperationException("Application files or bundled Node runtime are missing. Rebuild the Windows distribution.");

            string? url = null;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                int port = FreePort();
                backend = StartBackend(node, app, port);
                url = $"http://127.0.0.1:{port}/";
                if (WaitReady(url, backend))
                {
                    File.WriteAllText(StateFile, JsonSerializer.Serialize(new { port, launcherPid = Environment.ProcessId, startedAt = DateTimeOffset.UtcNow }));
                    Log($"Backend ready on loopback port {port}.");
                    break;
                }
                StopBackend();
                url = null;
                Log($"Backend startup attempt {attempt} failed; retrying with a new port.");
            }
            if (url == null) throw new InvalidOperationException("The local backend did not become ready. See the local launcher log.");
            if (selfTest) { Log("Self-test readiness passed."); return 0; }

            OpenBrowser(url);
            using var menu = new ContextMenuStrip();
            menu.Items.Add("Open MORS AEGIS", null, (_, _) => OpenBrowser(url));
            menu.Items.Add("Exit", null, (_, _) => Application.Exit());
            using var tray = new NotifyIcon { Icon = SystemIcons.Application, Text = "MORS AEGIS", ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (_, _) => OpenBrowser(url);
            backend!.EnableRaisingEvents = true;
            backend.Exited += (_, _) => Application.Exit();
            Application.Run();
            return 0;
        }
        catch (Exception ex)
        {
            Log($"Startup failure: {ex.GetType().Name}: {ex.Message}");
            if (!selfTest) MessageBox.Show(ex.Message, "MORS AEGIS startup failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        finally
        {
            StopBackend();
            if (ownsMutex)
            {
                try { File.Delete(StateFile); } catch { }
                mutex.ReleaseMutex();
            }
        }
    }

    private static Process StartBackend(string node, string app, int port)
    {
        var info = new ProcessStartInfo(node)
        {
            WorkingDirectory = app, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        info.ArgumentList.Add("server.mjs");
        info.Environment["HOST"] = "127.0.0.1";
        info.Environment["PORT"] = port.ToString();
        var dataDir = Path.Combine(StateDir, "data");
        Directory.CreateDirectory(dataDir);
        info.Environment["MORS_DB_PATH"] = Path.Combine(dataDir, "mors.sqlite");
        info.Environment.Remove("MORS_ALLOW_NETWORK_BIND");
        var suppliedFile = Environment.GetEnvironmentVariable("MORS_CREDENTIALS_FILE");
        var desktopFile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "New Text Document (2).txt");
        if (string.IsNullOrWhiteSpace(suppliedFile) && File.Exists(desktopFile)) info.Environment["MORS_CREDENTIALS_FILE"] = desktopFile;
        var process = Process.Start(info) ?? throw new InvalidOperationException("Could not start bundled Node runtime.");
        process.OutputDataReceived += (_, _) => { }; // Drain output without writing possible provider details.
        process.ErrorDataReceived += (_, _) => { };
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private static bool WaitReady(string url, Process process)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
        for (int i = 0; i < 40; i++)
        {
            if (process.HasExited) return false;
            try
            {
                using var response = http.GetAsync(url + "api/health").GetAwaiter().GetResult();
                if (response.IsSuccessStatusCode)
                {
                    // Catalog request performs the database open/migration and bundled-data ingest.
                    using var catalog = http.GetAsync(url + "api/catalog").GetAwaiter().GetResult();
                    if (catalog.IsSuccessStatusCode) return true;
                }
            }
            catch (HttpRequestException) { }
            catch (TaskCanceledException) { }
            Thread.Sleep(250);
        }
        return false;
    }

    private static int FreePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        int port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static string? ReadActiveUrl()
    {
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(StateFile));
            int port = json.RootElement.GetProperty("port").GetInt32();
            if (port < 1 || port > 65535) return null;
            var url = $"http://127.0.0.1:{port}/";
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(1) };
            using var response = http.GetAsync(url + "api/health").GetAwaiter().GetResult();
            return response.IsSuccessStatusCode ? url : null;
        }
        catch { return null; }
    }

    private static void OpenBrowser(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { Log($"Browser launch failed: {ex.GetType().Name}"); MessageBox.Show(url, "Open MORS AEGIS in your browser"); }
    }

    private static void StopBackend()
    {
        try
        {
            if (backend is { HasExited: false }) backend.Kill(entireProcessTree: true);
            backend?.WaitForExit(3000);
            backend?.Dispose();
        }
        catch { }
        backend = null;
    }

    private static void Log(string message)
    {
        try
        {
            Directory.CreateDirectory(StateDir);
            if (File.Exists(LogFile) && new FileInfo(LogFile).Length > 1_000_000) File.Move(LogFile, LogFile + ".old", overwrite: true);
            File.AppendAllText(LogFile, $"{DateTimeOffset.UtcNow:O} {message}{Environment.NewLine}");
        }
        catch { }
    }
}
