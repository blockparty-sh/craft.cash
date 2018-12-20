const fs         = require('fs');
const SimpleBar  = require('simplebar');
const M          = require('materialize-css');
const qrcode     = require('qrcode-generator');
const Handlebars = require('handlebars');
const bip39      = require('bip39');
const bch        = require('bitcore-lib-cash');
const explorer   = require('bitcore-explorers');
const sb         = require('satoshi-bitcoin');


const app = {};
app.bch = bch;
app.handlebars = Handlebars;
app.revision = fs.readFileSync(__dirname + '/../.git/refs/heads/master', 'utf-8');


app.append_to   = 'body'; // which element to append the wallet to
app.bitdb_token = '';     // enter token from https://bitdb.network/v3/dashboard
app.bitdb_url   = 'https://bitdb.fountainhead.cash/q/';
app.bitsocket_url = 'https://bitsocket.org/s/';
app.bitbox_url  = 'https://rest.bitbox.earth/v1/';

app.wallet_template          = fs.readFileSync(__dirname + '/templates/wallet.html', 'utf-8');
app.action_received_template = fs.readFileSync(__dirname + '/templates/action_received.html', 'utf-8');
app.action_sent_template     = fs.readFileSync(__dirname + '/templates/action_sent.html', 'utf-8');

app.fee_per_kb = 1000;
app.rpc        = 'https://cashexplorer.bitcoin.com';
app.transaction_sent_pane_time = 4800;
app.transaction_received_pane_time = 4800;

app.update_actions_query = () =>
    app.find_all_inputs_and_outputs(app.get_address_suffix(), 100);


app.bitsocket_listener = null;
app.default_bitsocket_listener = () => {
    return blockparty.initialize_bitsocket_listener(
        blockparty.find_all_outputs_without_inputs(blockparty.get_address_suffix(), 100),
        (r) => {
            if (r.type == 'mempool') {
                const txid = r.data[0].tx.h;
                let sats = 0;
                for (let j of r.data[0].out) {
                    if (j.e.a == blockparty.get_address_suffix()) {
                        sats += j.e.v;
                    }
                }
                blockparty.received_transaction(txid, sats);

                app.update_balance(app.update_balance_html);
                app.update_utxos();
                app.update_actions();
            }
            if (r.type == 'block') {
                app.update_balance(app.update_balance_html);
                app.update_actions();
            }
        }
    );
};



app.init = (options = {}) => {
    // overwrite any variables in app passed from options
    for (const o of Object.entries(options)) {
        app[o[0]] = o[1];
    }

    // compile templates
    app.wallet_template          = app.handlebars.compile(app.wallet_template);
    app.action_received_template = app.handlebars.compile(app.action_received_template);
    app.action_sent_template     = app.handlebars.compile(app.action_sent_template);

    // set up for generation of new address
    const new_address = app.generate_address();
    document
        .querySelector(app.append_to)
        .insertAdjacentHTML('beforeend', app.wallet_template({
            'address':  new_address.address,
            'mnemonic': new_address.mnemonic,
            'revision': app.revision,
        }));

    // set up libraries (materialize and scrollbar)
    M.AutoInit();
    for (const el of document.querySelectorAll('#blockparty-wallet .card-fixed-height')) {
        new SimpleBar(el);
    }


    // query elements
    app.blockparty_wallet_el = document
        .querySelector('#blockparty-wallet');

    app.receive_address_link_el = document
        .querySelector('#blockparty-wallet #receive-address-link');
    app.transaction_sent_pane_el = document
        .querySelector('#blockparty-wallet #transaction-sent-pane');
    app.sent_amount_el = document
        .querySelector('#blockparty-wallet #transaction-sent-pane #sent-amount');
    app.transaction_received_pane_el = document
        .querySelector('#blockparty-wallet #transaction-received-pane');
    app.received_amount_el = document
        .querySelector('#blockparty-wallet #transaction-received-pane #received-amount');
    app.send_btn_el = document
        .querySelector('#blockparty-wallet #send-btn');
    app.send_btn_text_el = document
        .querySelector('#blockparty-wallet #send-btn .btn-text');
    app.send_address_el = document
        .querySelector('#blockparty-wallet #send-address');
    app.send_amount_el  = document
        .querySelector('#blockparty-wallet #send-amount');
    app.mnemonic_import_str_el = document
        .querySelector('#blockparty-wallet #mnemonic-import-string');
    app.wif_import_str_el = document
        .querySelector('#blockparty-wallet #wif-import-string');
    app.import_btn_el = document
        .querySelector('#blockparty-wallet #import-btn');
    app.mnemonic_download_btn = document
        .querySelector('#blockparty-wallet #mnemonic-download-btn');
    app.logout_btn_el = document
        .querySelector('#blockparty-wallet #logout-btn');
    app.qrcode_el = document
        .querySelector('#blockparty-wallet #qrcode');
    app.balance_amnt_el = document
        .querySelector('#blockparty-wallet #balance-amnt');
    app.unconfirmed_balance_amnt_el = document
        .querySelector('#blockparty-wallet #unconfirmed-balance-amnt');
    app.logged_out_card_el = document
        .querySelector('#blockparty-wallet #logged-out-card');
    app.logged_in_card_el = document
        .querySelector('#blockparty-wallet #logged-in-card');


    // add listeners
    document
        .querySelectorAll('#blockparty-wallet .click-to-minimize')
        .forEach((item) => item.addEventListener('click', () => {
            if (app.blockparty_wallet_el.classList.contains('minimized')) {
                app.blockparty_wallet_el.classList.remove('minimized');
                localStorage.setItem('blockparty-wallet.minimized', false);
            } else {
                app.blockparty_wallet_el.classList.add('minimized');
                localStorage.setItem('blockparty-wallet.minimized', true);
            }
        }));

    app.logout_btn_el.addEventListener('click', () => {
        app.logout(app.update_logout_html);
    });

    const check_send_validity = () => {
        let ret = true;

        if (bch.Address.isValid(app.send_address_el.value)) {
            app.send_address_el.classList.add('valid');
            app.send_address_el.classList.remove('invalid');
        } else {
            app.send_address_el.classList.add('invalid');
            app.send_address_el.classList.remove('valid');
            ret = false;
        }

        const amount_sat = app.bch2sat(app.send_amount_el.value);
        if (amount_sat > 0
        && amount_sat <= app.get_balance() + app.get_unconfirmed_balance()) {
            app.send_amount_el.classList.add('valid');
            app.send_amount_el.classList.remove('invalid');
        } else {
            app.send_amount_el.classList.add('invalid');
            app.send_amount_el.classList.remove('valid');
            ret = false;
        }

        return ret;
    };

    const set_send_btn_disabled_on_validity = () => {
        if (! check_send_validity()) {
            app.send_btn_el.setAttribute('disabled', true);
        } else {
            app.send_btn_el.removeAttribute('disabled');
        }
    };

    app.send_address_el.addEventListener('blur', set_send_btn_disabled_on_validity);
    app.send_amount_el.addEventListener('blur',  set_send_btn_disabled_on_validity);

    app.send_btn_el.addEventListener('click', () => {
        if (check_send_validity()) {
            const address_v  = bch.Address.fromString(app.send_address_el.value);
            const amount_v   = app.bch2sat(app.send_amount_el.value);

            if (! window.confirm(
                `Are you sure you want to send ${app.send_amount_el.value} BCH to ${address_v} ?`
            )) {
                return;
            }

            app.send_btn_el.setAttribute('disabled', true);
            app.send_btn_text_el.innerText = 'Sending';

            app.send(address_v, amount_v, (tx) => {
                app.sent_amount_el.innerText = app.send_amount_el.value;
                app.sent_amount_el.setAttribute('href',
                    app.tx_link_url_mapper(tx.toJSON().hash)
                );

                app.send_address_el.value = '';
                app.send_address_el.classList.remove('valid');

                app.send_amount_el.value = '0';
                app.send_amount_el.classList.remove('valid');

                app.send_btn_el.removeAttribute('disabled');
                app.send_btn_text_el.innerText = 'Send';

                app.transaction_sent_pane_el.classList.remove('hidden-fade');
                app.transaction_sent_pane_el.classList.add('visible-fade');

                const cost = amount_v + (Math.ceil(tx.serialize().length * 2 / 1024) * app.fee_per_kb);
                localStorage.setItem('blockparty-wallet.balance', app.get_balance() - cost);
                app.update_balance(app.update_balance_html);

                setTimeout(() => {
                    app.transaction_sent_pane_el.classList.remove('visible-fade');
                    app.transaction_sent_pane_el.classList.add('hidden-fade');
                }, app.transaction_sent_pane_time);

                setTimeout(() => {
                    app.update_utxos();
                }, 5000);
            });
        }
    });

    app.mnemonic_download_btn.addEventListener('click', () => {
        app.download_string(
            new_address.mnemonic,
            'text/plain',
            'blockparty-wallet-mnemonic.txt'
        );

        const wif = app.import_mnemonic(new_address.mnemonic);
        app.login(wif, app.update_login_html);
        app.update_balance(app.update_balance_html);
        app.update_utxos();
        app.update_actions();
    });

    app.import_btn_el.addEventListener('click', () => {
        let wif = '';

        if (app.mnemonic_import_str_el.value != '') {
            wif = app.import_mnemonic(app.mnemonic_import_str_el.value);
        }
        
        if (app.wif_import_str_el.value != '') {
            wif = app.import_wif(app.wif_import_str_el.value);
        }

        if (! wif) {
            return;
        }

        app.mnemonic_import_str_el.value = '';
        app.wif_import_str_el.value = '';

        app.login(wif, app.update_login_html);
        app.update_balance(app.update_balance_html);
        app.update_utxos();
        app.update_actions();
    });

    if (app.is_minimized()) {
        app.blockparty_wallet_el.classList.add('minimized');
    }

    // check if user is logged in, if so then update frontend
    if (app.is_logged_in()) {
        // without timeout can result in rendering issue
        setTimeout(() => {
            app.login(app.get_wif(), app.update_login_html);
            app.update_balance(app.update_balance_html);
            app.update_utxos();
            app.update_actions();

            const qr = app.generate_qr_code(app.get_address());
            app.qrcode_el.innerHTML = qr.createImgTag();
        }, 0);
    }
};

app.received_transaction = (txid, satoshis) =>  {
    app.received_amount_el.innerText = "+" + app.sat2bch(satoshis) + " BCH";
    app.received_amount_el.setAttribute('href',
        app.tx_link_url_mapper(txid)
    );

    app.transaction_received_pane_el.classList.remove('hidden-fade');
    app.transaction_received_pane_el.classList.add('visible-fade');

    localStorage.setItem('blockparty-wallet.balance', app.get_balance() + satoshis);
    app.update_balance(app.update_balance_html);

    setTimeout(() => {
        app.transaction_received_pane_el.classList.remove('visible-fade');
        app.transaction_received_pane_el.classList.add('hidden-fade');
    }, app.transaction_received_pane_time);

    setTimeout(() => {
        app.update_utxos();
    }, 5000);
};


app.before_effects = {};
app.after_effects = {};

app.before = (method, callback) => {
    if (typeof app.before_effects[method] === 'undefined') {
        app.before_effects[method] = [];
    }

    app.before_effects[method].push(callback);
};

app.after = (method, callback) => {
    if (typeof app.after_effects[method] === 'undefined') {
        app.after_effects[method] = [];
    }

    app.after_effects[method].push(callback);
};

app.call_before = (method, args) => {
    if (typeof app.before_effects[method] !== 'undefined') {
        for (const o of app.before_effects[method]) {
            o(...args);
        }
    }
};

app.call_after = (method, args) => {
    if (typeof app.after_effects[method] !== 'undefined') {
        for (const o of app.after_effects[method]) {
            o(...args);
        }
    }
};

app.sat2bch = (sat) => sb.toBitcoin(sat);
app.bch2sat = (bch) => sb.toSatoshi(bch)|0;

app.hide = () => {
    document.getElementById('blockparty-wallet').style.display = 'none';
};

app.show = () => {
    document.getElementById('blockparty-wallet').style.display = 'inline-block';
};

app.receive_address_link_url_mapper = (address) => `https://explorer.bitcoin.com/bch/address/${address}`;
app.tx_link_url_mapper = (txid) => `https://explorer.bitcoin.com/bch/tx/${txid}`;


app.get_balance             = () => +localStorage.getItem('blockparty-wallet.balance');
app.get_unconfirmed_balance = () => +localStorage.getItem('blockparty-wallet.unconfirmed-balance');
app.get_wif         = () => localStorage.getItem('blockparty-wallet.wif');
app.is_logged_in    = () => !!app.get_wif();
app.is_minimized    = () => localStorage.getItem('blockparty-wallet.minimized') === 'true';
app.get_private_key = () => new bch.PrivateKey(app.get_wif());
app.get_address     = () => app.get_private_key().toAddress();
app.get_address_str = () => app.get_address().toString(bch.Address.CashAddrFormat);
app.get_address_suffix = () => app.get_address_str().split('bitcoincash:')[1];
app.get_utxos = () => {
    const l_utxos = JSON.parse(localStorage.getItem('blockparty-wallet.utxo'));
    const utxos = [];

    for (const u of l_utxos) {
        utxos.push({
            'txId'        : u['txid'],
            'outputIndex' : u['vout'],
            'address'     : u['address'],
            'script'      : u['script'],
            'satoshis'    : u['satoshis'],
        });
    }

    return utxos;
};


app.update_balance_html = () => {
    app.balance_amnt_el
        .innerHTML = app.sat2bch(app.get_balance() + app.get_unconfirmed_balance()) + ' BCH';

    if (app.get_unconfirmed_balance() > 0) {
        app.unconfirmed_balance_amnt_el
            .innerHTML = app.sat2bch(app.get_unconfirmed_balance()) + ' unconfirmed';
    }
};


app.update_login_html = () => {
    app.logged_out_card_el.classList.add('hide');
    app.logged_in_card_el.classList.remove('hide');

    const qr = app.generate_qr_code(app.get_address_str());
    app.qrcode_el.innerHTML = qr.createImgTag();

    app.receive_address_link_el.href      = app.receive_address_link_url_mapper(app.get_address_str());
    app.receive_address_link_el.innerHTML = app.get_address_str();
};


app.update_logout_html = () => {
    app.logged_out_card_el.classList.remove('hide');
    app.logged_in_card_el.classList.add('hide');
};


app.generate_qr_code = (address) => {
    app.call_before('generate_qr_code', [address]);

    const type_number = 0;
    const error_correction_level = 'H';

    const qr = qrcode(type_number, error_correction_level);
    qr.addData(address.toString(bch.Address.CashAddrFormat));
    qr.make();

    app.call_after('generate_qr_code', [address, qr]);

    return qr;
};

app.download_string = (text, filetype, filename) => {
    const blob = new Blob([text], {
        type: filetype,
    });

    const a = document.createElement('a');
    a.download = filename;
    a.href = URL.createObjectURL(blob);
    a.dataset.downloadurl = [filetype, a.download, a.href].join(':');
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
        URL.revokeObjectURL(a.href);
    }, 1500);
};

app.generate_address = () => {
    const mnemonic = bip39.generateMnemonic();
    const seed     = bip39.mnemonicToSeed(mnemonic);
    const hash     = bch.crypto.Hash.sha256(seed);
    const bn       = bch.crypto.BN.fromBuffer(hash);
    const key      = new bch.PrivateKey(bn);
    const address  = key.toAddress().toString(bch.Address.CashAddrFormat);

    return {
        'address':  address,
        'mnemonic': mnemonic,
    };
};

app.import_mnemonic = (mnemonic) => {
    if (! bip39.validateMnemonic(mnemonic)) {
        window.alert('Invalid mnemonic');
        return false;
    }

    const seed = bip39.mnemonicToSeed(mnemonic);
    const hash = bch.crypto.Hash.sha256(seed);
    const bn   = bch.crypto.BN.fromBuffer(hash);
    const key  = new bch.PrivateKey(bn);
    const wif  = key.toWIF();

    return wif;
};

app.import_wif = (wif) => {
    // todo: allow uncompressed wifs 
    // todo: perform better checking of validity

    if (wif.length != 52) {
        window.alert('WIF length must be 52');
        return false;
    }

    if (wif[0] != 'K' && wif[0] != 'L') {
        window.alert('WIF must start with either a K or an L');
        return false;
    }

    return wif;
}

app.login = (wif, callback) => {
    app.call_before('login', [wif]);

    localStorage.setItem('blockparty-wallet.wif', wif);

    // we might have just reloaded the page
    if (localStorage.getItem('blockparty-wallet.minimized') == null) {
        localStorage.setItem('blockparty-wallet.minimized', false);
    } else {
        if (app.is_minimized()) {
            app.blockparty_wallet_el.classList.add('minimized');
        }
    }

    if (app.default_bitsocket_listener) {
        app.bitsocket_listener = app.default_bitsocket_listener();
    }

    if (callback) {
        callback();
    }

    app.call_after('login', [wif]);
};

app.logout = (callback) => {
    app.call_before('logout', []);

    const localstorage_keys = [];
    for (let i=0; i<localStorage.length; ++i) {
        if (localStorage.key(i).substring(0, 17) == 'blockparty-wallet') {
            localstorage_keys.push(localStorage.key(i));
        }
    }

    for (const k of localstorage_keys) {
        localStorage.removeItem(k);
    }

    if (app.bitsocket_listener) {
        app.bitsocket_listener.close();
    }

    if (callback) {
        callback();
    }

    app.call_after('logout', []);
};

app.send = (address, satoshis, callback) => {
    app.call_before('send', [address, satoshis]);

    if (! app.is_logged_in()) {
        throw new Error('blockparty: sending without being logged in');
    }

    if (! bch.Address.isValid(address)) {
        throw new Error('blockparty: invalid address');
    }

    let tx = new bch.Transaction();
    tx.from(app.get_utxos());
    tx.to(address, satoshis);
    tx.feePerKb(app.fee_per_kb);
    tx.change(app.get_address());

    tx = app.clean_tx_dust(tx);
    tx.sign(app.get_private_key());

    app.broadcast_tx(tx, (tx) => {
        if (callback) {
            callback(tx);
        }
    });

    app.call_after('send', [address, satoshis, tx]);
};

app.clean_tx_dust = (tx) => {
	for (let i=0; i<tx.outputs.length; ++i) {
		if (tx.outputs[i]._satoshis > 0 && tx.outputs[i]._satoshis < 546) {
            tx.outputs.splice(i, 1);
            --i;
        }
    }

    return tx;
};

app.add_op_return_data = (tx, data) => {
    let script = new bch.Script();

    script.add(bch.Opcode.OP_RETURN);

    for (let m of data) {
        if (m['type'] == 'hex') {
            script.add(Buffer.from(m['v'], 'hex'));
        } else if(m['type'] == 'str') {
            script.add(Buffer.from(m['v']));
        } else {
            throw new Error('unknown data type');
        }
    }

    tx.addOutput(new bch.Transaction.Output({
        script:   script,
        satoshis: 0
    }));

    return tx;
};

app.broadcast_tx = (tx, callback, safe=true) => {
    app.call_before('broadcast_tx', [tx]);

    const insight = new explorer.Insight(app.rpc);

    let tx_data = "";
    if (safe) {
        tx_data = tx.serialize();
    } else {
        tx_data = tx.toString();
    }
    insight.broadcast(tx_data, () => {
        if (callback) {
            callback(tx);
        }

        app.call_after('broadcast_tx', [tx]);
    });
};

app.update_balance = (callback) => {
    app.call_before('update_balance', []);

    const url = 'address/details/' + app.get_address_str();

    app.query_bitbox(url, (r) => {
        localStorage.setItem('blockparty-wallet.balance',
                             r['balanceSat']);
        localStorage.setItem('blockparty-wallet.unconfirmed-balance',
                             r['unconfirmedBalanceSat']);
        localStorage.setItem('blockparty-wallet.total-sent',
                             r['totalSentSat']);
        localStorage.setItem('blockparty-wallet.total-received',
                             r['totalReceivedSat']);

        if (callback) {
            callback(r);
        }

        app.call_after('update_balance', []);
    });
};

app.update_utxos = (callback) => {
    app.call_before('update_utxos', []);
    const url = 'address/utxo/' + app.get_address_str();

    app.query_bitbox(url, (r) => {
        const utxos = [];
        for (const m of r) {
            utxos.push({
                txid:     m['txid'],
                satoshis: m['satoshis'],
                script:   m['scriptPubKey'],
                vout:     m['vout'],
                address:  m['cashAddress'],
            });
        }

        utxos.sort((a, b) => (a.satoshis > b.satoshis) ?  1
                          : ((a.satoshis < b.satoshis) ? -1
                          : 0));

        localStorage.setItem('blockparty-wallet.utxo', JSON.stringify(utxos));

        if (callback) {
            callback(r);
        }

        app.call_after('update_utxos', [utxos]);
    });
};

app.registered_actions_parsers = [];
app.registered_actions_parsers.push((tx, confirmed) => {
    const address = app.get_address_suffix();

    const txid = tx.tx.h;
    let date_string = '';
    if (typeof tx.blk === 'undefined') {
        date_string = 'X/X/X';
    } else {
        const date = new Date(tx.blk.t*1000);
        date_string = `${date.getMonth()}/${date.getDate()}/${1900+date.getYear()}`;
    }
    let amount = 0;
    let type = "";

    for (const j of tx.in) {
        if (j.e.a == address) {
            type = "sent";
            for (const j of tx.out) {
                if('bitcoincash:'+j.e.a != app.get_address_str()) {
                    amount += j.e.v;
                }
            }
            break;
        } else {
            type = "receive";
            for (const j of tx.out) {
                if(j.e.a == address) {
                    amount = j.e.v;
                    break;
                }
            }
            break;
        }
    }

    const template = type == 'sent'
        ? app.action_sent_template
        : app.action_received_template;

    document
        .querySelector('#blockparty-wallet #actions .collapsible')
        .insertAdjacentHTML('beforeend', template({
            'amnt':      app.sat2bch(amount),
            'date':      date_string,
            'txid':      txid,
            'txid_href': app.tx_link_url_mapper(txid),
        }));
});

app.update_actions = (callback) => {
    app.call_before('update_actions', []);
    app.query_bitdb(app.update_actions_query(), (r) => {
        for (const tx of r.u) {
            for (const parser of app.registered_actions_parsers) {
                parser(tx, false);
            }
        }

        for (const tx of r.c) {
            for (const parser of app.registered_actions_parsers) {
                parser(tx, true);
            }
        }

        if (callback) {
            callback(r);
        }

        app.call_after('update_actions', []);
    });
};

app.query_bitbox = (route, callback) => {
    const header = {
        headers: {},
    };

    const url = app.bitbox_url + route;

    fetch(url, header)
        .then((r) => r.json())
        .then(callback);
};

app.query_bitdb = (q, callback) => {
    const b64 = btoa(JSON.stringify(q));
    const url = app.bitdb_url + b64;

    const headers = {};
    if (typeof app.bitdb_token !== 'undefined' && app.bitdb_token != '') {
        headers.headers = {
            key: app.bitdb_token,
        };
    }

    fetch(url, headers)
        .then((r) => r.json())
        .then(callback);
};

app.initialize_bitsocket_listener = (q, callback) => {
    const b64 = btoa(JSON.stringify(q));
    const url = app.bitsocket_url + b64;

    const socket = new EventSource(url);
    socket.onmessage = (e) => {
        callback(JSON.parse(e.data));
    }
    return socket;
};

app.find_all_inputs_and_outputs = (addr, limit) => ({
    v: 3,
    q: {
        find: {
            '$or': [
                {'in.e.a':  addr},
                {'out.e.a': addr},
            ]
        },
        limit: limit,
    }
});

app.find_all_outputs_without_inputs = (addr, limit) => ({
    v: 3,
    q: {
        find: {
            'in.e.a':  {'$ne': addr},
            'out.e.a': addr,
        }
    }
});


window.blockparty = app;
