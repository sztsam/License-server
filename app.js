require('dotenv').config()
var https = require('https');
var express = require('express');
var fs = require('fs');
var zlib = require('zlib');
var CronJob = require('cron').CronJob;
var JavaScriptObfuscator = require('javascript-obfuscator');

var DEBUG = false;
var SELL_NODE = {
    domain: process.env.SELL_NODE_DOMAIN,
    port: process.env.PORT || 8080,
    map_cache: `${__dirname}/map_data/`,
    servers_player_data: {},
    cronjob: [],
    license_types: {},
    markets: {},
    scripts: {},
    servers: [],
    rate_limiter_clients: {}
};
SELL_NODE.sleep = function (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
SELL_NODE.mongodb = require(`${require.main.path}/mongodb.js`);
SELL_NODE.read_data = async function () {
    SELL_NODE.license_types = JSON.parse(fs.readFileSync('./license_types.json'));
    SELL_NODE.markets = JSON.parse(fs.readFileSync('./markets.json'));
    SELL_NODE.scripts = JSON.parse(fs.readFileSync('./scripts.json'));
    await SELL_NODE.load_map_data();
    await SELL_NODE.load_scripts();
}
SELL_NODE.map_data = async function () {
    function delete_old_maps() {
        fs.readdir(SELL_NODE.map_cache, (err, files) => {
            if (err) throw err;
            for (let file of files) {
                fs.unlinkSync(`${SELL_NODE.map_cache}${file}`);
            }
        });
        console.log("Old maps deleted Successfully");
    }
    async function get_servers() {
        var servers = [];
        for await (let s of SELL_NODE.markets.map(x => x.market)) {
            var link = SELL_NODE.markets.filter(x => x.market === s)[0].twstat;
            var promise = new Promise((resolve) => {
                https.get(link, function (response) {
                    var data;
                    response.on('data', (chunk) => {
                        data += chunk;
                    });
                    response.on("end", () => {
                        var all_servers = data.split('<span class="world">');
                        for (let i = 1; i < all_servers.length; i++) {
                            if (!all_servers[i].includes("closed")) {
                                servers.push(all_servers[i].split('</span')[0].toLowerCase());
                            }
                        }
                        resolve(data);
                    })
                })
            });
            var wait_for_promise = await promise;
        }
        return servers;
    };
    async function save_map_player(server, server_link) {
        var promise = new Promise((resolve) => {
            var request = https.get(`https://${server}${server_link}/map/player.txt.gz`, function (response) {
                if (response.statusCode !== 200) { resolve(); return; }
                fs.writeFileSync(`${SELL_NODE.map_cache}${server}_map_player.txt`, '');
                var filepath = fs.createWriteStream(`${SELL_NODE.map_cache}${server}_map_player.txt`);
                var unzip = zlib.createUnzip();
                response.pipe(unzip).pipe(filepath);
                filepath.on("finish", () => {
                    filepath.close();
                    resolve();
                });
            })
        });
        var wait_for_promise = await promise;
    };
    delete_old_maps();
    SELL_NODE.servers = await get_servers();
    for await (let server of SELL_NODE.servers) {
        var market = server.substring(0, 2);
        var server_link = SELL_NODE.markets.filter(x => x.market === market)[0].link;
        await save_map_player(server, server_link);
    }
    console.log("All map data downloaded");
    return true;
}
SELL_NODE.cron_jobs = async function (type) {
    /*
    - Seconds: 0-59
    - Minutes: 0-59
    - Hours: 0-23
    - Day of Month: 1-31
    - Months: 0-11 (Jan-Dec)
    - Day of Week: 0-6 (Sun-Sat)
    */
    switch (type) {
        case "read":
            SELL_NODE.cronjob[1] = new CronJob('0 5 */1 * * *', function () {
                const d = new Date();
                SELL_NODE.read_data();
            });
            SELL_NODE.cronjob[1].start();
            console.log("cronjob read started");
            break;
        case "map":
            SELL_NODE.cronjob[2] = new CronJob('0 0 */1 * * *', function () {
                const d = new Date();
                SELL_NODE.map_data();
            });
            SELL_NODE.cronjob[2].start();
            console.log("cronjob map started");
            break;
        case "generate_preobfuscated":
            SELL_NODE.cronjob[3] = new CronJob('0 0 */1 * * *', function () {
                const d = new Date();
                SELL_NODE.generate_preobfuscated();
            });
            SELL_NODE.cronjob[3].start();
            console.log("cronjob generate_preobfuscated started");
            break;
    }
}
SELL_NODE.obfuscate = async function (snippet) {
    var options = {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: false,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false,
        debugProtectionInterval: 0,
        disableConsoleOutput: false,
        domainLock: [],
        domainLockRedirectUrl: 'about:blank',
        forceTransformStrings: [],
        identifierNamesCache: null,
        identifierNamesGenerator: 'mangled-shuffled',
        identifiersDictionary: [],
        identifiersPrefix: '',
        ignoreImports: false,
        inputFileName: '',
        log: false,
        numbersToExpressions: false,
        optionsPreset: 'default',
        renameGlobals: false,
        renameProperties: false,
        renamePropertiesMode: 'safe',
        reservedNames: [],
        reservedStrings: [],
        seed: 0,
        selfDefending: false,
        simplify: true,
        sourceMap: false,
        sourceMapBaseUrl: '',
        sourceMapFileName: '',
        sourceMapMode: 'separate',
        sourceMapSourcesMode: 'sources-content',
        splitStrings: false,
        splitStringsChunkLength: 2,
        stringArray: true,
        stringArrayCallsTransform: false,
        stringArrayCallsTransformThreshold: 0.5,
        stringArrayEncoding: [
            "base64",
            "rc4"
        ],
        stringArrayIndexesType: [
            "hexadecimal-number",
            "hexadecimal-numeric-string"
        ],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 0,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 2,
        stringArrayWrappersType: 'variable',
        stringArrayThreshold: 1,
        target: 'browser',
        transformObjectKeys: true,
        unicodeEscapeSequence: false
    };
    var obfuscationResult = JavaScriptObfuscator.obfuscate(snippet, options);
    return (obfuscationResult.getObfuscatedCode());
}
SELL_NODE.license_check = async function (server, player, script) {
    var player_data, player_data_check, script_data, script_data_check, purchase_data, purchase_data_check, error = [];
    var check_result = {
        valid: true,
        error: error
    }
    async function check_player_data() {
        script === "auto_pp_business"
            ? player_data = (await SELL_NODE.mongodb.FIND_SELLER(player.name, server))[0]
            : player_data = (await SELL_NODE.mongodb.FIND_USER(player.name, server))[0];
        return player_data ? player_data : false;
    }
    function check_script_data() {
        if (script === "auto_pp_business") {
            script_data = [{
                type: player_data.type,
                time: player_data.time
            }];
            return true;
        }
        var banned_servers = [];
        var valid_servers = [server.slice(2), "all"];
        script_data = player_data.scripts.filter(x => x.name === script && x.market === server.substring(0, 2) && valid_servers.includes(x.server));
        var banned_filter = script_data.filter(x => x.ban).forEach(y => banned_servers.push(`${y.market}${y.server}`));
        var banned = banned_servers.includes(server) || banned_servers.includes(`${server.substring(0, 2)}all`) ? true : false;
        if (banned) { return "banned" }
        var script_data_map = script_data.map(x => `${x.market}${x.server}`);
        script_data_check = script_data_map.includes(server) || script_data_map.includes(`${server.substring(0, 2)}all`);
        return script_data_check;
    }
    function check_purchase_data() {
        var valid_purchase = [];
        var valid_purchase_expire = [];
        purchase_data = {
            "type": script_data.map(x => x.type),
            "date": script_data.map(x => x.time)
        };
        function generate_date(date) {
            var purchase_date = new Date();
            purchase_date.setFullYear(date.split(".")[0]);
            purchase_date.setMonth(date.split(".")[1] - 1);
            purchase_date.setDate(date.split(".")[2].split(" ")[0]);
            purchase_date.setHours(date.split(" ")[1].split(":")[0]);
            purchase_date.setMinutes(date.split(":")[1]);
            return purchase_date;
        }
        for (let i = 0; i < purchase_data.type.length; i++) {
            switch (purchase_data.type[i]) {
                case "permanent":
                    valid_purchase.push(script_data[i]);
                    valid_purchase_expire.push(9999999999);
                    break;
                case "subscription":
                    var purchase_date = generate_date(purchase_data.date[i]);
                    var time_month = 1000 * 60 * 60 * 24 * 31;
                    if (purchase_date.getTime() + time_month > Date.now()) {
                        valid_purchase.push(script_data[i]);
                        valid_purchase_expire.push(purchase_date.getTime() + time_month);
                    }
                    break;
            }
        }
        return {
            valid_purchase: valid_purchase,
            valid_purchase_expire: valid_purchase_expire
        }
    }
    function create_error(type) {
        switch (type) {
            case "player":
                error.push(`No registered player with name ${player.name}!`);
                check_result.valid = false;
                break;
            case "server":
                error.push(`No registered ${script} script for ${server}!`);
                check_result.valid = false;
                break;
            case "purchase":
                error.push(`No purchased ${script} script for ${server} or subscription expired!`);
                check_result.valid = false;
                break;
            case "banned":
                error.push(`Your account is banned. Reason: ${player_data.ban_reason}. Contact -Sam!`);
                check_result.valid = false;
                break;
        }
    }
    player_data_check = await check_player_data();
    if (!player_data_check) { create_error("player"); return check_result; }
    if (player_data?.ban) { create_error("banned"); return check_result; }
    script_data_check = await check_script_data();
    if (script_data_check === "banned") { create_error("banned"); return check_result; }
    if (!script_data_check) { create_error("server"); return check_result; }
    purchase_data_check = await check_purchase_data();
    if (purchase_data_check.valid_purchase.length < 1) { create_error("purchase"); return check_result; }
    check_result.expire = Math.max(...purchase_data_check.valid_purchase_expire)
    return check_result;
}
SELL_NODE.license_generate = async function (server, player, expire) {
    String.prototype.obfs = function (key, n = 126) {
        if (!(typeof (key) === 'number' && key % 1 === 0)
            || !(typeof (key) === 'number' && key % 1 === 0)) {
            return this.toString();
        }
        var chars = this.toString().split('');
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i].charCodeAt(0);
            if (c <= n) {
                chars[i] = String.fromCharCode((chars[i].charCodeAt(0) + key) % n);
            }
        }
        return chars.join('');
    };
    function get_random_key(type) {
        var encode_key = Math.ceil(Math.random() * 5000);
        var charset = type === "master" ? Math.ceil(Math.random() * 2000 + 5200) : Math.ceil(Math.random() * 5000 + 126);
        var decode_key = Math.ceil(Math.fround(encode_key / charset)) * charset - encode_key;
        return {
            encode_key: encode_key,
            decode_key: decode_key,
            charset: charset
        }
    }
    var player_formatted = player.name.replace(/([^a-z0-9]+)/gi, '-');
    var keys = {
        MARKET: get_random_key(),
        SERVER: get_random_key(),
        PLAYER: get_random_key(),
        PLAYER_ID: get_random_key(),
        EXPIRE: get_random_key(),
        MASTER: get_random_key("master")
    };
    var market;
    switch (server.substring(0, 2)) {
        case "cs":
            market = "cz";
            break;
        default:
            market = server.substring(0, 2);
            break;
    }
    function get_encode_string(type, string) {
        function encode_string() {
            return string.obfs(keys[type].encode_key, keys[type].charset);
        }
        if (encode_string().includes(":")) {
            keys[type] = get_random_key();
            return get_encode_string(type, string);
        }
        else {
            return encode_string();
        }
    }
    var encoded_strings = {
        MARKET: get_encode_string("MARKET", market),
        SERVER: get_encode_string("SERVER", server),
        PLAYER: get_encode_string("PLAYER", player_formatted),
        PLAYER_ID: get_encode_string("PLAYER_ID", `${player.id ? player.id : player.player_id}`),
        EXPIRE: get_encode_string("EXPIRE", `${expire}`),
    };
    var license = `${encoded_strings.PLAYER_ID}:${encoded_strings.MARKET}:${encoded_strings.EXPIRE}:${encoded_strings.SERVER}:${encoded_strings.PLAYER}`;
    var encoded_license = license.obfs(keys.MASTER.encode_key, keys.MASTER.charset);
    encoded_license = btoa(unescape(encodeURIComponent(encoded_license)));
    //decode_MASTER: encoded_license.obfs(keys.MASTER.decode_key, keys.MASTER.encode_charset);
    //decode_keys: license.license.obfs(+license.keys[5][0].obfs(15), +license.keys[5][1].obfs(15))
    return {
        valid: true,
        license: encoded_license,
        keys: {
            0: [`${keys.MARKET.decode_key}`.obfs(111), `${keys.MARKET.charset}`.obfs(111)],
            1: [`${keys.SERVER.decode_key}`.obfs(111), `${keys.SERVER.charset}`.obfs(111)],
            2: [`${keys.PLAYER.decode_key}`.obfs(111), `${keys.PLAYER.charset}`.obfs(111)],
            3: [`${keys.EXPIRE.decode_key}`.obfs(111), `${keys.EXPIRE.charset}`.obfs(111)],
            4: [`${keys.PLAYER_ID.decode_key}`.obfs(111), `${keys.PLAYER_ID.charset}`.obfs(111)],
            5: [`${keys.MASTER.decode_key}`.obfs(111), `${keys.MASTER.charset}`.obfs(111)]
        }
    };
}
SELL_NODE.license_degenerate_snippet = `
    String.prototype.obfs = function (key, n = 126) {
        if (!(typeof (key) === 'number' && key % 1 === 0)
            || !(typeof (key) === 'number' && key % 1 === 0)) {
            return this.toString();
        }
        var chars = this.toString().split('');
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i].charCodeAt(0);
            if (c <= n) {
                chars[i] = String.fromCharCode((chars[i].charCodeAt(0) + key) % n);
            }
        }
        return chars.join('');
    };
    if (!license.valid){ return; }
    var pre_master = decodeURIComponent(escape(window.atob( license.license )));
    var master = pre_master.obfs(+license.keys[5][0].obfs(15), +license.keys[5][1].obfs(15));
    var splitted = master.split(":");
    var player_id = splitted[0].obfs(+license.keys[4][0].obfs(15), +license.keys[4][1].obfs(15));
    var market = splitted[1].obfs(+license.keys[0][0].obfs(15), +license.keys[0][1].obfs(15));
    var expire = splitted[2].obfs(+license.keys[3][0].obfs(15), +license.keys[3][1].obfs(15));
    var server = splitted[3].obfs(+license.keys[1][0].obfs(15), +license.keys[1][1].obfs(15));
    var player = splitted[4].obfs(+license.keys[2][0].obfs(15), +license.keys[2][1].obfs(15));
    if (+player_id !== game_data.player.id) { return; }
    if (market !== game_data.market) { return; }
    if (server !== game_data.world) { return; }
    if (player !== game_data.player.name.replace(/([^a-z0-9]+)/gi, '-')) { return; }
    if (+expire < Date.now()/1000) { return; }
`;
SELL_NODE.license_degenerate_snippet_the_west = `
    String.prototype.obfs = function (key, n = 126) {
        if (!(typeof (key) === 'number' && key % 1 === 0)
            || !(typeof (key) === 'number' && key % 1 === 0)) {
            return this.toString();
        }
        var chars = this.toString().split('');
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i].charCodeAt(0);
            if (c <= n) {
                chars[i] = String.fromCharCode((chars[i].charCodeAt(0) + key) % n);
            }
        }
        return chars.join('');
    };
    if (!license.valid){ return; }
    var pre_master = decodeURIComponent(escape(window.atob( license.license )));
    var master = pre_master.obfs(+license.keys[5][0].obfs(15), +license.keys[5][1].obfs(15));
    var splitted = master.split(":");
    var player_id = splitted[0].obfs(+license.keys[4][0].obfs(15), +license.keys[4][1].obfs(15));
    var market = splitted[1].obfs(+license.keys[0][0].obfs(15), +license.keys[0][1].obfs(15));
    var expire = splitted[2].obfs(+license.keys[3][0].obfs(15), +license.keys[3][1].obfs(15));
    var server = splitted[3].obfs(+license.keys[1][0].obfs(15), +license.keys[1][1].obfs(15));
    var player = splitted[4].obfs(+license.keys[2][0].obfs(15), +license.keys[2][1].obfs(15));
    if (+player_id !== Character.playerId) { return; }
    if (market !== Game.gameURL.split("//")[1].split(".")[0].replace(/[0-9]/g,"")) { return; }
    if (server !==  Game.gameURL.split("//")[1].split(".")[0]) { return; }
    if (player !== Character.name.replace(/([^a-z0-9]+)/gi, '-')) { return; }
    if (+expire < Date.now()/1000) { return; }
`;
SELL_NODE.license_degenerate_snippet_preobfuscated = SELL_NODE.obfuscate(SELL_NODE.license_degenerate_snippet);
SELL_NODE.ENCODE_DECODE_PAYLOAD = function encode_decode_payload(get_snippet, type, payload) {
    if (get_snippet) {
        return `
        String.prototype.obfs = function (key, n = 126) {
            if (!(typeof (key) === 'number' && key % 1 === 0)
                || !(typeof (key) === 'number' && key % 1 === 0)) {
                return this.toString();
            }
            var chars = this.toString().split('');
            for (var i = 0; i < chars.length; i++) {
                var c = chars[i].charCodeAt(0);
                if (c <= n) {
                    chars[i] = String.fromCharCode((chars[i].charCodeAt(0) + key) % n);
                }
            }
            return chars.join('');
        };
        function encode(payload) {
            var encoded_payload = payload.obfs(2000, 2847);
            encoded_payload = btoa(unescape(encodeURIComponent(encoded_payload)));
            return encoded_payload;
        }
        `;
    }
    String.prototype.obfs = function (key, n = 126) {
        if (!(typeof (key) === 'number' && key % 1 === 0)
            || !(typeof (key) === 'number' && key % 1 === 0)) {
            return this.toString();
        }
        var chars = this.toString().split('');
        for (var i = 0; i < chars.length; i++) {
            var c = chars[i].charCodeAt(0);
            if (c <= n) {
                chars[i] = String.fromCharCode((chars[i].charCodeAt(0) + key) % n);
            }
        }
        return chars.join('');
    };
    switch (type) {
        case "encode":
            var encoded_payload = payload.obfs(2000, 2847);
            encoded_payload = btoa(unescape(encodeURIComponent(encoded_payload)));
            return encoded_payload;
        case "decode":
            var decoded_payload = decodeURIComponent(escape(atob(payload)));
            decoded_payload = decoded_payload.obfs(847, 2847);
            return decoded_payload;
    }
}
SELL_NODE.generate_script_snippet = async function (script, type) {
    var snippet = SELL_NODE.scripts[script].script[type].toString();
    snippet = snippet.replaceAll("process.env.SELL_NODE_DOMAIN", `"${process.env.SELL_NODE_DOMAIN}"`);
    snippet = snippet.replaceAll(`"INSERT_LICENSE_CHECK_HERE"`, SELL_NODE.license_degenerate_snippet);
    snippet = snippet.replaceAll(`"INSERT_LICENSE_CHECK_HERE_THE_WEST"`, SELL_NODE.license_degenerate_snippet_the_west);
    snippet = snippet.replaceAll(`"INSERT_ENCODE_DECODE_PAYLOAD_HERE"`, SELL_NODE.ENCODE_DECODE_PAYLOAD(true));
    return snippet;
}
SELL_NODE.generate_preobfuscated = async function () {
    var scripts = Object.keys(SELL_NODE.scripts);
    for await (let script of scripts) {
        var snippets = SELL_NODE.scripts[script]?.script?.PRE_OBFUSCATED;
        if (snippets === undefined) { continue; };
        for await (let snippet of Object.keys(snippets)) {
            var generated_snippet = await SELL_NODE.generate_script_snippet(script, snippet);
            var obfuscated_snippet = await SELL_NODE.obfuscate(generated_snippet);
            if (snippet === "START") {
                obfuscated_snippet = `${obfuscated_snippet} ${snippet.toLowerCase()}();`;
                generate_start_file(script, obfuscated_snippet);
            }
            else {
                obfuscated_snippet = `function(param1,param2){ ${obfuscated_snippet} ${snippet.toLowerCase()}(param1,param2);}`;
            }
            SELL_NODE.scripts[script].script.PRE_OBFUSCATED[snippet] = obfuscated_snippet;
        }
        var file = `${__dirname}/SCRIPTS/${script}/preobfuscated_snippets.json`;
        var snippet_save = JSON.stringify(SELL_NODE.scripts[script].script.PRE_OBFUSCATED, null, 4);
        fs.writeFileSync(file, snippet_save);
    }
    function generate_start_file(script, snippet) {
        var file = `${__dirname}/SCRIPTS/${script}/${script}_start.js`;
        var start_file = fs.readFileSync(file, "utf8").split("\n");
        var generate_start_file = [];
        var tampermonkey_options = {
            name: { name: "// @name         ", value: script },
            namespace: { name: "// @namespace    ", value: "made by -Sam" },
            description: { name: "// @description  ", value: "try to take over the world!" },
            author: { name: "// @author       ", value: "-Sam" },
            version: { name: "// @version      ", value: SELL_NODE.scripts[script].script.VERSION },
        }
        for (let row of start_file) {
            if (row.startsWith("//")) {
                if (row.startsWith(tampermonkey_options.name.name)) { generate_start_file.push(`${tampermonkey_options.name.name}${tampermonkey_options.name.value}`); }
                else if (row.startsWith(tampermonkey_options.namespace.name)) { generate_start_file.push(`${tampermonkey_options.namespace.name}${tampermonkey_options.namespace.value}`); }
                else if (row.startsWith(tampermonkey_options.description.name)) { generate_start_file.push(`${tampermonkey_options.description.name}${tampermonkey_options.description.value}`); }
                else if (row.startsWith(tampermonkey_options.author.name)) { generate_start_file.push(`${tampermonkey_options.author.name}${tampermonkey_options.author.value}`); }
                else if (row.startsWith(tampermonkey_options.version.name)) { generate_start_file.push(`${tampermonkey_options.version.name}${tampermonkey_options.version.value}`); }
                else { generate_start_file.push(row); }
            }
            else {
                generate_start_file.push("");
                if (script === "auto_pp_business") {
                    generate_start_file.push(`SELLER_ID= ''`);
                    generate_start_file.push("");
                }
                break;
            }
        }
        generate_start_file.push(snippet);
        fs.writeFileSync(file, generate_start_file.join("\n"));
    }
}
SELL_NODE.load_scripts = async function () {
    var scripts = fs.readdirSync("./SCRIPTS/");
    for await (let script of scripts) {
        try {
            SELL_NODE.scripts[script].script = require(`./SCRIPTS/${script}/${script}.js`);
        }
        catch (e) { console.error(e); }
    }
}
SELL_NODE.load_map_data = async function () {
    var servers = fs.readdirSync(SELL_NODE.map_cache);
    for await (let server of servers) {
        if (server.includes("player")) {
            try {
                SELL_NODE.servers_player_data[server.split("_")[0]] = fs.readFileSync(SELL_NODE.map_cache + server, "utf8").split("\n");
            }
            catch (e) { console.error(e); }
        }
    }
}
SELL_NODE.rate_limiter = async function (request, response) {
    var max_requests_per_interval = 150;
    var ban_limit = 150;
    var interval = 1 * 60 * 1000;
    var client_ip = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
    if (!SELL_NODE.rate_limiter_clients[client_ip]) {
        SELL_NODE.rate_limiter_clients[client_ip] = {
            requests: 0,
            last_request: Date.now()
        };
    }
    var client = SELL_NODE.rate_limiter_clients[client_ip];
    var last_request_time = Date.now() - client.last_request;
    if (last_request_time > interval) {
        client.requests = 1;
        client.last_request = Date.now();
    }
    else {
        client.requests++;
    }
    if (client.requests === ban_limit) {
        SELL_NODE.mongodb.BAN("ip", client_ip, "Too many requests");
    }
    if (client.requests > max_requests_per_interval) {
        response.status(429).json({
            status: "ERROR",
            error: "Too many requests, please try again later"
        });
        return true;
    }
}
SELL_NODE.backend_server = express();
SELL_NODE.backend_server.use(express.json());
SELL_NODE.backend_server.use(express.text());
SELL_NODE.backend_server.use(async function (request, response, next) {
    if (await SELL_NODE.rate_limiter(request, response)) { return; }
    if (request.method === "POST" && request.headers.developer !== "-Sam") {
        response.status(404).json({
            status: "ACCESS DENIED"
        });
        return;
    }
    response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,developer');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});
SELL_NODE.backend_server.use(express.static(`${__dirname}/client/build`));
SELL_NODE.backend_server.get('*', (request, response) => {
    response.sendFile(`${__dirname}/client/build/index.html`);
});
SELL_NODE.backend_server.post("/", async function (request, response) {
    try {
        request.body = JSON.parse(SELL_NODE.ENCODE_DECODE_PAYLOAD(false, "decode", request.body));
    }
    catch { }
    var response_data = await SELL_NODE.handle_post_request(request, request.body);
    response.json(response_data);
});
SELL_NODE.handle_post_request = async function (request, request_data) {
    var response_data = {
        status: "ACCESS DENIED"
    };
    var client_host = request.headers.origin;
    var client_ip = request.headers['x-forwarded-for'] || request.connection.remoteAddress;
    var script_types = Object.keys(SELL_NODE.scripts);
    if (!script_types.includes(request_data.script)) { response_data.status = "INVALID SCRIPT"; return response_data; }
    var request_types = Object.keys(SELL_NODE.scripts[request_data.script].request_types);
    if (!request_types.includes(request_data.type)) { response_data.status = "INVALID REQUEST TYPE"; return response_data; }
    var player_server = client_host.split("//")[1].split(".")[0];
    if (request_data.type !== "license_check" && request_data.type !== "get_seller_data") {
        request_data.player = SELL_NODE.ENCODE_DECODE_PAYLOAD(false, "decode", request_data.player);
        if (+request_data.player.split(";")[1] < Date.now() - 120 * 1000) { return response_data; }
        request_data.player = JSON.parse(request_data.player.split(";")[0]);
        var license = await SELL_NODE.license_check(player_server, request_data.player, request_data.script);
        if (!license.valid) { response_data.error = license.error; return response_data; }
        var license_generated = await SELL_NODE.license_generate(player_server, request_data.player, license.expire);
    }
    var script_response = await SELL_NODE.scripts[request_data.script].script.HANDLE_REQUEST(request_data);
    if (!script_response.status) { response_data.status = "ERROR"; response_data.error = script_response.snippet; return response_data; }
    return {
        status: "OK",
        snippet: script_response.snippet,
        license: license_generated
    };
}
SELL_NODE.keep_connection_alive = async function () {
    https.get(SELL_NODE.domain, function (response) { });
}
SELL_NODE.start = async function () {
    await SELL_NODE.mongodb.START();
    await SELL_NODE.read_data();
    await SELL_NODE.cron_jobs("read");
    await SELL_NODE.cron_jobs("map");
    await SELL_NODE.cron_jobs("generate_preobfuscated");
    //SELL_NODE.generate_preobfuscated()
    await SELL_NODE.backend_server.listen(SELL_NODE.port, function () {
        console.log(`Server running on domain: ${SELL_NODE.domain} port: ${SELL_NODE.port}`);
    });
    setInterval(SELL_NODE.keep_connection_alive, 400000);
    DEBUG ? SELL_NODE.DEBUG() : false;
}
SELL_NODE.DEBUG = async function () {
    console.log(`obfuscation start: ${Date.now()}`)
    var start = Date.now();
    var dd = await SELL_NODE.obfuscate(SELL_NODE.sleep.toString());
    console.log(`obfuscation end: ${Date.now()}`)
    var end = Date.now();
    console.log(end - start);
}
SELL_NODE.start();

// error handling
process.on("uncaughtException", (error) => { console.log(error); });