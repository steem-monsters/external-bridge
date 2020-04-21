const WebSocket = require('ws');
const utils = require('./utils');

var local_service = null;

function startClient(url, name, on_tx, ops) { 
	try {
		local_service = new WebSocket(url); 

		local_service.on('open', function () { 
			utils.log('Socket connected!', 2);
			local_service.send(JSON.stringify({ type: 'subscribe', name, ops }));
		});
		
		local_service.on('error', e => utils.log('Socket connection error: ' + e));
		
		local_service.on('close', function (e) { 
			utils.log('Socket disconnected...', 2);
			setTimeout(() => startClient(url, name, on_tx, ops), 1000);
		});

		local_service.on('message', message => {
			msg = utils.tryParse(message);

			switch(msg.type) {
				case 'status':
					utils.log(`Connection status: ${msg.status}`, 2);
					break;
				case 'tx':
					on_tx(msg.tx);
					break;
				default:
					utils.log(`Unknown message type: ${message}`, 2);
					break;
			}
		});

	} catch (err) { utils.log('Socket connection error: ' + err, 2); }
}

module.exports = { startClient };