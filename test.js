const bridge = require('./external-bridge');

start();

async function start() {
	bridge.init({ logging_level: 4, game_api_url: "http://localhost:3000", prefix: "matt-sm_" });
	bridge.stream(onTx);
}

async function onTx(tx) {
	console.log(tx);
}