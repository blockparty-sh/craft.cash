# Blockparty Wallet Alpha

Blockparty wallet is an in-browser [Bitcoin Cash](https://www.bitcoincash.org/) wallet which is designed to be embedded into web applications to speed up development of new blockchain apps. It does not require you to run a bitcoin node or any other software on your server, deploy and configure with just Javascript and CSS. 

Please note that this project is in development, has not been battle tested, and is not really designed for amounts of money you aren't ok with losing. There may be bugs or security issues with it. The codebase is intended to be small enough for you to audit yourself and determine if it is useful for your project.

![Picture of wallet](picture.png)

#### Thanks to the following projects which made this possible

- https://bitdb.network/
- https://bitsocket.org/
- https://bitbox.earth/
- https://bitcore.io/
- https://github.com/bitcoinjs/bip39
- https://github.com/dawsbot/satoshi-bitcoin/
- https://materializecss.com
- https://handlebarsjs.com/
- https://github.com/soldair/node-qrcode
- https://github.com/Grsmto/simplebar


## Building


I recommend you use nvm https://github.com/creationix/nvm

You must also have `make` installed to automate building. 

#### Development

```bash
nvm use node
npm install -g browserify
npm install -g prefix-css
npm install -g uglify-es
npm install -g uglifycss
npm install
make
```

#### Release

```bash
make release
```

#### Linting

```bash
make lint
```

## Examples

#### Simple

If you start a web server (`python -m SimpleHTTPServer 8000`) and open `http://127.0.0.1:8000/examples/simple.html` in your browser you can interact and test out the wallet. This is a basic unmodified wallet.

#### Memo Client

Start a web server as shown above and open `http://127.0.0.1:8000/examples/memo.html`. This shows how to make a very basic memo client.

#### craft.cash

See `https://craft.cash` for an example of a full application built using the blockparty wallet. 


## Using in Your Application

#### Loading from blockparty.sh

This will keep updated with the most recent version of the code. This can be easier way to use but it is probably better if you use the Git instruction below for stability and security reasons.

Add the following to the `<head>` of your page for the development version:

```html
<link rel="stylesheet" href="https://blockparty.sh/wallet/dist/blockparty-wallet.css">
<script src="https://blockparty.sh/wallet/dist/blockparty-wallet.js"></script>
```

Or the minified version:

```html
<link rel="stylesheet" href="https://blockparty.sh/wallet/dist/blockparty-wallet.min.css">
<script src="https://blockparty.sh/wallet/dist/blockparty-wallet.min.js"></script>
```


#### Git (recommended)

First you'll want to add this repo as a subtree. To do this run this command:

`git subtree add --prefix wallet https://github.com/blockparty-sh/wallet master`

Then, whenever you'd like to update the wallet just run this command

`git pull -X theirs -s subtree https://github.com/blockparty-sh/wallet master`



## Methods


#### `blockparty.init(options: object)`
Initializes the wallet and attaches it to the page. 


##### Options

| option | description | required | type | default|
|--------|-------------|----------|------|--------|
| bitdb_token | Grab this from https://bitdb.network/v3/dashboard | :heavy_check_mark: | string | |
| append_to | Which element to append the wallet to | | string | body |
| bitdb_url | Modify this if you are running custom bitdb instance.  | |string |  https://fountainhead.cash/q/ |
| bitsocket_url | Modify this if you are running custom bitsocket instance.  | |string |  https://bitsocket.network/q/ |
| bitbox_url | Modify this if you are running custom bitbox instance. | |string |  https://rest.bitbox.earth/v1/ |
| fee_per_kb | Satoshis per kilobyte for fee. |  | integer |  1000 |
| transaction_received_pane_time | How long to show the received pane in milliseconds. |  | integer |  4800 |
| transaction_sent_pane_time | How long to show the sent pane in milliseconds. |  | integer |  4800 |
| rpc | What rpc service to use for sending transactions. | | string |  https://cashexplorer.bitcoin.com |
| wallet_template | Handlebars template for wallet. | | string | `fs.readFileSync(__dirname + '/templates/wallet.html', 'utf-8');` |
| action_received_template | Handlebars template for received action. | | string | `fs.readFileSync(__dirname + '/templates/action_received.html', 'utf-8');` |
| action_sent_template | Handlebars template for sent action. | | string | `fs.readFileSync(__dirname + '/templates/action_sent.html', 'utf-8');`|
| update_actions_query | Data to query bitdb with when update_actions is called. | | function | `() => find_all_inputs_and_outputs(blockparty.get_address_suffix(), 100);` |
| default_bitsocket_listener | This creates a bitsocket on login and closes on delete. Used for watching new transactions. Set to `null` if you don't want it to run. | | function | `() => {} -> EventSource (see code) ` |

##### Example

```js
blockparty.init({
    'bitdb_token': 'qp9rzh6levrrn5r5x4slc6q7qxhl452dty5nuyuq6m',
    'fee_per_kb': 1337
});
```

#### `blockparty.get_address() -> bch.Address()`
Retrieves the Address object associated with logged in user.

##### Example

```js

blockparty.get_address().network.name == 'livenet'
```

#### `blockparty.get_address_str() -> string`
Retrieves the string representation of the logged in address. This could be used to look up on an explorer website. 

##### Example
```js

blockparty.get_address_str() == 'bitcoincash:qz4xkn3wx9a04a6yvpkcz4lca5qdf0aslq50hy3v9g'
```

#### `blockparty.get_address_suffix() -> string`
Retrieves the string representation of the logged in address for bitdb queries. It is the same as `get_address_str()` with the `bitcoincash:` prefix removed.

##### Example
```js

blockparty.get_address_suffix() == 'qz4xkn3wx9a04a6yvpkcz4lca5qdf0aslq50hy3v9g'
```

#### `blockparty.get_wif() -> string`
Retrieves the "Wallet import format" of a private key. This is stored in localStorage to be able to perform actions on behalf of an address. It is a base58 encoded representation of a double sha-256'd extended key, with a checksum and network type included.

##### Example
```js

console.log(`don't share this with anyone: ${blockparty.get_wif()}`)
```

#### `blockparty.get_balance() -> integer`
Retrieves the amount of satoshis that are confirmed for the user. You might want to combine this and the unconfirmed balance to get the "full" balance, but this depends on the application.

##### Example
```js

if (blockparty.get_balance() > 100000000) {
    console.log('you have at least 1 bitcoin');
}
```

#### `blockparty.get_unconfirmed_balance() -> integer`
Retrieves the amount of satoshis that are unconfirmed for the user.

##### Example
```js

if (blockparty.get_unconfirmed_balance() == 0) {
    console.log('you have no unconfirmed bitcoin');
}
```

#### `blockparty.get_utxos() -> [object]`
Retrieves the utxo set associated with an address. This is used for sending transactions. In the blockparty implementation by default all utxos are used as inputs for the next send.

##### Example
```js

for (const utxo of blockparty.get_utxos()) {
    console.log(utxo['txid']);
}
```

#### `blockparty.get_private_key() -> bch.PrivateKey()`
Retrieves the private key of a logged in address. This imports the WIF stored in localStorage.

##### Example
```js

if (blockparty.get_private_key().publicKey.compressed) {
    console.log('your public key is compressed');
}
```

#### `blockparty.is_logged_in() -> boolean`
Checks if currently logged in.

##### Example
```js

if (! blockparty.is_logged_in()) {
    console.log('not logged in');
}
```

#### `blockparty.send(address: bch.Address, satoshis: integer, callback: (tx) => {})`
Performs a basic transaction: to send N satoshis to an address. A callback may be provided in order to perform additional processing after the broadcast has completed.

##### Example
```js

const address = blockparty.bch.Address.fromString('bitcoincash:qz4xkn3wx9a04a6yvpkcz4lca5qdf0aslq50hy3v9g');
const sats = 2000;
blockparty.send(address, sats, (tx) => {
    console.log('transaction sent');
    console.log(tx);
});

```

#### `blockparty.clean_tx_dust(tx: bch.Transaction) -> bch.Transaction`
Removes all outputs with more than 0 and less than 546 satoshis. This is a protocol limit.

##### Example
```js

let tx = new blockparty.bch.Transaction();
tx.from(blockparty.get_utxos());
tx = blockparty.clean_tx_dust(tx);

```

#### `blockparty.add_op_return_data(tx: bch.Transaction, data: [object]) -> bch.Transaction

Adds one or more `OP_RETURN` data points. If you use this, make sure that when you call `blockparty.broadcast_tx` you set safe to false as currently `bitcore-lib-cash` doesn't like the multiple `OP_RETURN` arguments. 

To use this pass an array containing `type` and `v`. `type` may be either `hex` or `str`.

##### Example
```js

let tx = new blockparty.bch.Transaction();
tx.from(blockparty.get_utxos());
tx = blockparty.add_op_return_data(tx, [
    {'type': 'hex', 'v': '6d01'},
    {'type': 'str', 'v': 'testing testing'},
]);

```

#### `blockparty.broadcast_tx(tx: bch.Transaction, callback: (tx) => {}, safe: boolean = true)`
Sends a transaction off to the network. This uses the `blockparty.rpc` option to choose a server. It sends the serialized form of a transaction to a bitcoin node. A callback may be provided in order to perform additional processing after the broadcast has completed. `send` uses this internally to actually broadcast the transaction. The `safe` parameter is used to choose between safe serialization or just conversion to string. In case of using OP_RETURN you must disable safe mode, and therefore bitcore-lib-cash will not give an error on broadcast.

##### Example
```js

const address = blockparty.bch.Address.fromString('bitcoincash:qz4xkn3wx9a04a6yvpkcz4lca5qdf0aslq50hy3v9g');
const sats = 2000;

let tx = new blockparty.bch.Transaction();
tx.from(blockparty.get_utxos());
tx.to(address, sats);
tx.feePerKb(blockparty.fee_per_kb);
tx.change(blockparty.get_address());
tx = blockparty.clean_tx_dust(tx);
tx.sign(blockparty.get_private_key());

blockparty.broadcast_tx(tx, (tx) => {
    console.log('transaction broadcast');
    console.log(tx);
});
```

#### `blockparty.before(method: string, callback: (...) => {})`
Registers a call to perform prior to performing a blockparty method. The valid method options are:

- `'generate_qr_code', (address: bch.Address) => {}`
- `'login', (wif: string) => {}`
- `'logout', () => {}`
- `'send', (address: bch.Address, satoshis: integer) => {}`
- `'broadcast_tx'`, (tx: bch.Transaction) => {}
- `'update_balance'`, () => {}
- `'update_utxos'`, () => {}
- `'update_actions'`, () => {}


##### Example
```js

blockparty.before('send', (address, satoshis) => {
    console.log('sending ${satoshis} to ${address}');
});
```

#### blockparty.after(method: string, callback: (...) => {})
Registers a call to perform after performing a blockparty method. The valid method options are:

- `'generate_qr_code', (address: bch.Address, qr: qrcode) => {}`
- `'login', (wif: string) => {}`
- `'logout', () => {}`
- `'send', (address: bch.Address, satoshis: integer, tx: bch.Transaction) => {}`
- `'broadcast_tx'`, (tx: bch.Transaction) => {}
- `'update_balance'`, () => {}
- `'update_utxos'`, (utxos: [object]) => {}
- `'update_actions'`, () => {}

##### Example
```js

blockparty.after('login', (wif) => {
    sound_controller.play_clip('login.wav');
});
```

#### `blockparty.update_balance(callback: (data) => {})`

Retrieves the logged in addresses balance and updates localStorage, these values are set:

- `blockparty-wallet.balance`
- `blockparty-wallet.unconfirmed-balance`
- `blockparty-wallet.total-sent`
- `blockparty-wallet.total-received`

And the callback receives the json from bitbox.

##### Example
```js

blockparty.update_balance((data) => {
    console.log('new balance is ${blockparty.get_balance()}');
});
```

#### `blockparty.update_utxos(callback: (data) => {})`
Retrieves the utxo set for the logged in address. The callback contains the json from bitbox. 

##### Example
```js

blockparty.update_utxos((data) => {
    console.log('you have ${blockparty.get_utxos().length} utxos');
});
```

#### `blockparty.update_actions(callback: (data) => {})`
Retrieves the transactions involving an address and displays them in the actions pane. 

##### Example
```js

blockparty.update_actions(() => {
    console.log('actions updated');
});

```

#### `blockparty.query_bitdb(query: object, callback: (data: object) => {})`
Performs a query on the bitdb database which results in a Json object.
Find documentation for this at https://bitdb.network/ 

##### Example
```js
const test_query = (addr) => ({
    'v': 3,
    'q': {
        'find': {
            'in.e.a':  addr
        },
        'limit': 10
    },
    'r': {
        'f': '[ .[] | { block: .blk.i?, timestamp: .blk.t?, content: .out[1]?.s2 }]'
    }
});

blockparty.query_bitdb(test_query(blockparty.get_address_str()), (r) => {
    console.log(r);
});

```

#### `blockparty.login(wif: string, callback: () => {})`
Logs in with WIF string. For normal operation you will not need to call this yourself.

##### Example
```js

const wif = '...';
blockparty.login(wif, () => {
    // do some html stuff or something here, will run after localStorage is updated.
    console.log('logged in');
});
```

#### `blockparty.logout(callback: () => {})`
Logs out. With normal operation you will not need to call this yourself. This is called when the logout button is clicked.

##### Example
```js

blockparty.logout(() => {
    console.log('logged out');
});
```

## Helpers

#### `blockparty.sat2bch(sat: integer) -> string`

Gets the bch value of some satoshis like 13370000. Use this because Javascripts number handling will introduce small errors otherwise.

#### `blockparty.bch2sat(bch: string) -> integer`

Gets the satoshis of a bch amount like 0.1337. Use this because Javascripts number handling will introduce small errors otherwise.

#### `blockparty.hide()`

Hides the wallet interface.

#### `blockparty.show()`

Shows the wallet interface (after its been hidden).

#### `blockparty.receive_address_link_url_mapper(address)`

Generates link href for an explorer.bitcoin.com address.

#### `blockparty.tx_link_url_mapper(txid)`

Generates link href for an explorer.bitcoin.com tx.


## Special

#### `blockparty.bch`
You may access the `bitcore-lib-cash` library with `blockparty.bch`. See an example of this in `blockparty.broadcast_tx`. You can see more examples and documentation over at https://github.com/bitpay/bitcore-lib-cash 

#### `blockparty.handlebars`
You may access the `Handlebars` library with `blockparty.handlebars`. See an example of this in `examples/memo.html`.

#### `blockparty.registered_actions_parsers`
This is an array of functions which take a transaction to run on each transaction which is the result of the `blockparty.update_actions_query` in `blockparty.update_actions`. The default implementation is to create the Sent and Received templates, but this can be removed and you can do some other processing. So for example, instead of sent and received templates you could have one for comments and posts, and then show something else for those types of transactions. 
