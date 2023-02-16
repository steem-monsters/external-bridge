const Operations = require('./operations');
const ExternalBridge = require("./external-bridge");

async function start() {
    const bridge = new ExternalBridge({
        games: [
            {
                name: 'splinterlands',
                api_url: "http://localhost:3000",
                cb: onTx,
                types: () => true,
                state_file_name: 'sl-state.json',
            },
			{
				name: 'validator',
				api_url: "http://localhost:3340",
				cb: onTx,
				types: () => true,
				state_file_name: 'v-state.json',
				is_validator: true,
			}
        ],
		api: {
			port: 3100,
			external_status: () => ({ chain: 'test', last_updated: new Date() }),
		}
    })

	Operations.init({
		logging_level: 4,
		prefix: "matt-sm_",
	});

	bridge.stream();

	process.on('SIGINT', async () => {
		await bridge.stop();
		// Exit program as hive interface has an uninterruptible setTimeout running.
		process.exit(0);
	});
}

async function onTx(tx) {
    console.log(tx);
}

start();
