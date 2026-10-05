import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const webHost = env.WEB_HOST || process.env.WEB_HOST || "127.0.0.1";
  const webPort = Number(env.WEB_PORT || process.env.WEB_PORT || 3000);
  const apiHost = env.API_HOST || process.env.API_HOST || "127.0.0.1";
  const apiPort = Number(env.API_PORT || process.env.API_PORT || 4000);

  return {
    plugins: [vue()],
    server: {
      host: webHost,
      port: webPort,
      strictPort: true,
      // Allow Cloudflare tunnel hostnames when they forward to :3000
      allowedHosts: [".splinter.fun", ".vm.splinter.fun", ".trycloudflare.com", "localhost", "127.0.0.1"],
      proxy: {
        "/api": {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: webHost,
      port: webPort,
      strictPort: true,
      allowedHosts: [".splinter.fun", ".vm.splinter.fun", ".trycloudflare.com", "localhost", "127.0.0.1"],
      proxy: {
        "/api": {
          target: `http://${apiHost}:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
