const bridge = require('./external-bridge');

start();

async function start() {
	bridge.init();
	bridge.stream('test client', onTx, ['all']);
}

async function onTx(tx) {
	console.log(tx);
}