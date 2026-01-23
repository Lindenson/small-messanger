const http = require("http");
const app = require("./app");
const { initWSServer } = require("./ws/wsServer");

const server = http.createServer(app);
initWSServer(server);

server.listen(3000, () => {
    console.log("🚀 Server on :3000");
});
