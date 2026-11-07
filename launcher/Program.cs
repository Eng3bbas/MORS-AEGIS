using System.Diagnostics;
using System.Drawing;
using System.Net;
using System.Net.Sockets;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows.Forms;

internal static class Program
{
    private static readonly string StateDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MORS-AEGIS");
    private static readonly string StateFile = Path.Combine(StateDir, "launcher-state.json");
    private static readonly string LogFile = Path.Combine(StateDir, "launcher.log");
    private static readonly string AccessTokenFile = Path.Combine(StateDir, "lan-access.token");
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
            int activePort = 0;
            for (int attempt = 1; attempt <= 3; attempt++)
            {
                int port = FreePort();
                backend = StartBackend(node, app, port);
                url = $"http://127.0.0.1:{port}/";
                if (WaitReady(url, backend))
                {
                    File.WriteAllText(StateFile, JsonSerializer.Serialize(new { port, launcherPid = Environment.ProcessId, startedAt = DateTimeOffset.UtcNow }));
                    Log($"Backend ready on port {port}; LAN access is protected by an access token.");
                    activePort = port;
                    break;
                }
                StopBackend();
                url = null;
                Log($"Backend startup attempt {attempt} failed; retrying with a new port.");
            }
            if (url == null) throw new InvalidOperationException("The local backend did not become ready. See the local launcher log.");
            if (selfTest) { Log("Self-test readiness passed."); return 0; }

            var lanUrl = GetLanAddress() is { } ip ? $"http://{ip}:{activePort}/" : "No private LAN address detected.";
            var accessToken = File.ReadAllText(AccessTokenFile).Trim();
            var firewallReady = EnsureFirewallRule(activePort);
            OpenBrowser(url);
            using var menu = new ContextMenuStrip();
            menu.Items.Add("Open MORS AEGIS", null, (_, _) => OpenBrowser(url));
            menu.Items.Add("LAN access details", null, (_, _) => MessageBox.Show(
                $"On another device connected to this private network, open:\n{lanUrl}\n\nAccess token:\n{accessToken}\n\n{(firewallReady ? "Windows Firewall is configured for the private network." : "Windows Firewall could not be configured. Allow mors.exe on Private networks or create a private-network TCP inbound rule for port " + activePort + ".")}",
                "MORS AEGIS — LAN access", MessageBoxButtons.OK, firewallReady ? MessageBoxIcon.Information : MessageBoxIcon.Warning));
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
        info.Environment["HOST"] = "0.0.0.0";
        info.Environment["PORT"] = port.ToString();
        info.Environment["MORS_ALLOW_NETWORK_BIND"] = "1";
        info.Environment["MORS_ACCESS_TOKEN"] = GetOrCreateAccessToken();
        var dataDir = Path.Combine(StateDir, "data");
        Directory.CreateDirectory(dataDir);
        info.Environment["MORS_DB_PATH"] = Path.Combine(dataDir, "mors.sqlite");
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
        var cookies = new CookieContainer();
        using var handler = new HttpClientHandler { CookieContainer = cookies };
        using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(1) };
        for (int i = 0; i < 40; i++)
        {
            if (process.HasExited) return false;
            try
            {
                using var login = http.PostAsync(url + "api/auth", new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = File.ReadAllText(AccessTokenFile).Trim() })).GetAwaiter().GetResult();
                if (!login.IsSuccessStatusCode) { Thread.Sleep(250); continue; }
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
        for (int port = 4173; port <= 4200; port++)
        {
            try { using var listener = new TcpListener(IPAddress.Any, port); listener.Start(); return port; }
            catch (SocketException) { }
        }
        throw new InvalidOperationException("Ports 4173–4200 are busy. Close another MORS instance or free a port in this range.");
    }

    private static string GetOrCreateAccessToken()
    {
        try { var existing = File.ReadAllText(AccessTokenFile).Trim(); if (existing.Length >= 32) return existing; }
        catch { }
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        File.WriteAllText(AccessTokenFile, token);
        return token;
    }

    private static string? GetLanAddress() => NetworkInterface.GetAllNetworkInterfaces()
        .Where(item => item.OperationalStatus == OperationalStatus.Up && item.NetworkInterfaceType != NetworkInterfaceType.Loopback)
        .SelectMany(item => item.GetIPProperties().UnicastAddresses)
        .Where(item => item.Address.AddressFamily == AddressFamily.InterNetwork)
        .Select(item => item.Address)
        .FirstOrDefault(address => !IPAddress.IsLoopback(address) && (address.GetAddressBytes()[0] == 10 || address.GetAddressBytes()[0] == 192 && address.GetAddressBytes()[1] == 168 || address.GetAddressBytes()[0] == 172 && address.GetAddressBytes()[1] >= 16 && address.GetAddressBytes()[1] <= 31))?.ToString();

    private static bool EnsureFirewallRule(int port)
    {
        var rule = $"MORS AEGIS Private LAN {port}";
        try
        {
            var check = Process.Start(new ProcessStartInfo("netsh.exe", $"advfirewall firewall show rule name=\"{rule}\"") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true });
            if (check != null)
            {
                var output = check.StandardOutput.ReadToEnd();
                check.WaitForExit(3000);
                if (check.ExitCode == 0 && output.Contains("Rule Name", StringComparison.OrdinalIgnoreCase)) return true;
            }
            var add = new ProcessStartInfo("netsh.exe") { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
            foreach (var arg in new[] { "advfirewall", "firewall", "add", "rule", $"name={rule}", "dir=in", "action=allow", $"program={Environment.ProcessPath}", "enable=yes", "profile=private", "protocol=TCP", $"localport={port}", "remoteip=localsubnet" }) add.ArgumentList.Add(arg);
            using var process = Process.Start(add);
            return process != null && process.WaitForExit(30_000) && process.ExitCode == 0;
        }
        catch (Exception ex) { Log($"Private LAN firewall rule was not installed: {ex.GetType().Name}."); return false; }
    }

    private static string? ReadActiveUrl()
    {
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(StateFile));
            int port = json.RootElement.GetProperty("port").GetInt32();
            if (port < 1 || port > 65535) return null;
            var url = $"http://127.0.0.1:{port}/";
            var cookies = new CookieContainer();
            using var handler = new HttpClientHandler { CookieContainer = cookies };
            using var http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(1) };
            using var login = http.PostAsync(url + "api/auth", new FormUrlEncodedContent(new Dictionary<string, string> { ["token"] = File.ReadAllText(AccessTokenFile).Trim() })).GetAwaiter().GetResult();
            if (!login.IsSuccessStatusCode) return null;
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
