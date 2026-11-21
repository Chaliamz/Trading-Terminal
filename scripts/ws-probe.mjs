// Dev-only probe: verifies Hyperliquid WS message shapes through the container proxy.
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const ws = new WebSocket("wss://api.hyperliquid.xyz/ws", proxy ? { agent: new HttpsProxyAgent(proxy) } : {});
const seen = {};
ws.on("open", () => {
  ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "candle", coin: "BTC", interval: "1m" } }));
  ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "bbo", coin: "BTC" } }));
  ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin: "BTC" } }));
  ws.send(JSON.stringify({ method: "ping" }));
});
ws.on("message", (m) => {
  const j = JSON.parse(m.toString());
  seen[j.channel] = (seen[j.channel] || 0) + 1;
  if (seen[j.channel] <= 1) console.log(j.channel, JSON.stringify(j.data ?? j).slice(0, 400));
});
ws.on("error", (e) => console.error("ERR", e.message));
setTimeout(() => { console.log("counts", seen); ws.close(); process.exit(0); }, 8000);
