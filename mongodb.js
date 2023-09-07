require('dotenv').config()
var MongoClient = require('mongodb').MongoClient;
var uuid = require('uuid');

var client = new MongoClient(process.env.SELL_NODE_MONGODB_URI);

module.exports = {
    main_db: "SELL_NODE_DATABASE",
    users: "USERS",
    sellers: "SELLERS",
    sample: {
        user: {
            user: "-Sam",
            pass: "",
            ban: false,
            ban_reason: "",
            ip: "127.0.0.1",
            market: "hu",
            scripts: []
        },
        seller: {
            name: "-Sam",
            id: uuid.v4(),
            accounts: [],
            passwords: [],
            fixips: [],
            ban: false,
            ban_reason: "",
            market: "hu",
            type: "subscription",
            time: "2022.12.15 08:00",
            settings: {
                STOP: false,
                login: true,
                server: "hu72",
                next_server: "hu73",
                next_server_start: "2021/10/28 10:10",
                casual_server: "hup10",
            }
        },
        script: {
            name: "multi_village_bot",
            market: "hu",
            server: "all",
            type: "permanent",
            time: "2022.12.15 08:00",
            ban: false
        }
    },
    item_not_exist: [null, "NaN", "undefined", undefined],
    CONNECT: async function () {
        try {
            await client.connect();
            console.log("Connected successfully to database");
        }
        catch (e) {
            console.error(e);
        }
    },
    CLOSE: async function () {
        await client.close();
    },
    SETUP_DATABASE: async function () {
        this.main_db = client.db(this.main_db);
        this.users = this.main_db.collection(this.users);
        this.sellers = this.main_db.collection(this.sellers);
        if (await this.users.countDocuments() < 1) {
            this.users.insertOne(this.sample.user)
        }
        if (await this.sellers.countDocuments() < 1) {
            this.sellers.insertOne(this.sample.seller)
        }
    },
    FIND_USER: async function (user, market) {
        var options = {
            user: user,
            market: market.substring(0, 2)
        };
        var found_user = await this.users.find(options).toArray();
        return found_user;
    },
    CREATE_USER: async function (data) {
        var user_exist = ((await this.FIND_USER(data.user, data.market)).length);
        if (user_exist < 1) {
            var errors = [];
            if (this.item_not_exist.includes(data.user)) { errors.push("Username error") }
            if (this.item_not_exist.includes(data.market)) { errors.push("Market error") }
            if (this.item_not_exist.includes(data.ip)) { errors.push("IP error") }
            if (errors.length > 0) {
                return {
                    status: "error",
                    message: errors
                };
            }
            var new_data = this.sample.user;
            new_data.user = data.user;
            data.pass?.length > 4 ? new_data.pass = data.pass : new_data.pass = this.sample.user.pass;
            new_data.ip = data.ip;
            new_data.market = data.market.length > 2 ? data.market.substring(0, 2) : data.market;
            this.users.insertOne(new_data);
            return {
                status: "OK",
                message: "User created successfully"
            };
        }
        else {
            return {
                status: "OK",
                message: "User already exist"
            };
        }
    },
    ADD_SCRIPT_TO_USER: async function (data) {
        var user = (await this.FIND_USER(data.user, data.market))[0];
        if (this.item_not_exist.includes(user)) {
            var user_created = await this.CREATE_USER(data);
            if (user_created.status == "error") {
                return {
                    status: "error",
                    message: user_created.message
                };
            }
            else {
                user = (await this.FIND_USER(data.user, data.market))[0];
            }
        }
        if (user.ban) {
            return {
                status: "error",
                message: "User is banned"
            };
        }
        var errors = [];
        if (this.item_not_exist.includes(data.name)) { errors.push("Script error") }
        if (this.item_not_exist.includes(data.market)) { errors.push("Market error") }
        if (this.item_not_exist.includes(data.type)) { errors.push("Type error") }
        if (errors.length > 0) {
            return {
                status: "error",
                message: errors
            };
        }
        var date = new Date();
        var script_data = this.sample.script;
        script_data.name = data.name;
        script_data.market = data.market.substring(0, 2);
        script_data.server = data.market.slice(2);
        script_data.type = data.type;
        script_data.time = `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()} ${date.getHours()}:${date.getMinutes()}`;
        var bought_scripts = user.scripts.filter(x => x.name === data.name && x.server === script_data.server);
        if (bought_scripts.length > 0) {
            for (let i = 0; i < user.scripts.length; i++) {
                if (user.scripts[i].name === script_data.name && user.scripts[i].server === script_data.server && !user.scripts[i].ban) {
                    user.scripts[i] = script_data;
                }
            }
        }
        else {
            user.scripts.push(script_data);
        }
        this.users.updateOne({ user: data.user, market: data.market.substring(0, 2) }, { $set: { scripts: user.scripts } });
        return {
            status: "OK",
            message: "Script added successfully"
        };
    },
    BAN: async function (type, data, reason) {
        switch (type) {
            case "ip":
                this.users.updateMany({ ip: data }, { $set: { ban: true, ban_reason: reason } });
                console.log(`banned [${data}]: ${reason}`);
                break;
            case "user":
                this.users.updateMany({ user: data }, { $set: { ban: true, ban_reason: reason } });
                console.log(`banned [${data}]: ${reason}`);
                break;
        }
    },
    FIND_SELLER: async function (user, market) {
        var options = {
            accounts: user,
            market: market.substring(0, 2),
        };
        var found_user = await this.sellers.find(options).toArray();
        return found_user;
    },
    CREATE_SELLER: async function (data) {
        var seller_exist = ((await this.FIND_SELLER(data.user, data.market, data.id)).length);
        if (seller_exist < 1) {
            var errors = [];
            if (this.item_not_exist.includes(data.user)) { errors.push("Username error") }
            if (this.item_not_exist.includes(data.market)) { errors.push("Market error") }
            if (this.item_not_exist.includes(data.ip)) { errors.push("IP error") }
            if (errors.length > 0) {
                return {
                    status: "error",
                    message: errors
                };
            }
            var new_data = this.sample.seller;
            this.sellers.insertOne(new_data);
            return {
                status: "OK",
                message: "User created successfully"
            };
        }
        else {
            return {
                status: "OK",
                message: "User already exist"
            };
        }
    },
    GET_SELLER_DATA: async function (id) {
        var options = {
            id: id,
        };
        var found_seller = (await this.sellers.find(options).toArray())[0];
        return {
            status: found_seller ? "OK" : "ERROR",
            accounts: found_seller.accounts,
            passwords: found_seller.passwords,
            ip: found_seller.fixips,
            settings: found_seller.settings
        };
    },
    CHANGE_SELLER_DATA: async function (data) {
        this.sellers.updateOne({ id: data.id }, {
            $set: {
                accounts: data.accounts,
                passwords: data.passwords,
                fixips: data.ip,
                settings: data.settings
            }
        });
        return {
            status: "OK",
            message: "Seller data updated successfully"
        };
    },
    START: async function () {
        await this.CONNECT();
        await this.SETUP_DATABASE();
    }
}