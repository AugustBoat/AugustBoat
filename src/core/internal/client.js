'use strict';

const { Client } = require('eris');
const PluginManager = require('../managers/plugin-manager');
const EventManager = require('../managers/event-manager');
const SchedulerManager = require('../managers/scheduler-manager');
const DatabaseManager = require('../managers/database-manager');
const winston = require('winston');
const { MessageEmbed, Collection } = require('@maika.xyz/eris-utils');
const i18nStore = require('../stores/i18n-store');
const { Cluster } = require('lavalink');
const RESTClient = require('./rest');

i18nStore.bootstrap();

module.exports = class MaikaClient extends Client {
    constructor() {
        super(process.env.MAIKA_TOKEN, {
            maxShards: 'auto',
            disableEveryone: true,
            autoreconnect: true
        });

        this.manager = new PluginManager(this);
        this.events = new EventManager(this);
        this.schedulers = new SchedulerManager(this);
        this.database = new DatabaseManager(this);
        this.logger = winston.createLogger({
            transports: [new winston.transports.Console()],
            format: winston.format.combine(
                winston.format.colorize({ level: true }),
                winston.format.timestamp({ format: 'hh:MM:ss'}),
                winston.format.printf(info => `[${info.timestamp}] [${info.level}] <=> ${info.message}`)
            )
        });
        this.rest = new RESTClient(this);
        /** @type {Collection<string, import('./audio/audio-player')>} */
        this.players = new Collection();
        this.translate = i18nStore.i18n().__;

        this.once('ready', () => {
            this.schedulers.tasks.forEach((s) => s.run(this));
            this.lavalink = new Cluster({
                nodes: [{
                    hosts: {
                        ws: `ws://${process.env.LAVALINK_HOST}:1334`,
                        rest: `http://${process.env.LAVALINK_HOST}:2337`
                    },
                    password: process.env.LAVALINK_PASSWORD,
                    shardCount: 1,
                    userID: this.user.id
                }],
                send: (guildID, packet) => {
                    const shardID = this.guildShardMap[guildID];
                    const shard = this.shards.get(shardID);
                    if (!shard)
                        return;
    
                    return shard.ws.send(JSON.stringify(packet));
                }
            });
        });
    }

    async bootstrap() {
        this.manager.start();
        this.events.start();
        this.schedulers.start();
        this.database.connect();
        await super.connect()
            .then(() => this.logger.info("Maika is now connecting to Discord."));
    }

    /**
     * Redact private information
     * @param {string} str The result from the eval or exec commands
     * @returns {string} The tokens truncated as `--snip--`
     */
    redact(str) {
        const regex = new RegExp([
            process.env.MAIKA_TOKEN,
            process.env.WOLKE,
            process.env.PPY,
            this.token,
            process.env.LAVALINK_PASSWORD
        ].join('|'), 'gi');
        return str.replace(regex, '--snip--');
    }

    /**
     * Delays an action for `x` many milliseconds
     * @param {number} ms Thew number to sleep
     * @returns {Promise<any>} An empty promise that it actually slept / delayed
     */
    sleep(ms) {
        return new Promise((res) => setTimeout(res(), ms));
    }

    /**
     * Destroy the Maika instance
     * @returns {Promise<void>} An empty promise
     */
    async destroy() {
        await this.disconnect({ reconnect: false });
        await this.database.destroy();
    }

    /**
     * Reboots Maika (for emergency purposes)
     * @returns {void} nOOP
     */
    async reboot() {
        this.client.logger.warn('Maika is being rebooted!');
        await this.destroy();
        await this.sleep(60 * 1000);
        this.bootstrap();
    }

    /**
     * Gets the normal embed
     * @returns {import('@maika.xyz/eris-utils').MessageEmbed} The message embed
     */
    getEmbed() {
        return new MessageEmbed()
            .setColor(0xE67EDE)
            .setAuthor(`${this.client.user.username}#${this.client.user.discriminator}`, null, this.user.avatarURL)
            .setFooter(`Running v${require('../../package').version} | Made by auguwu & other contributors`);
    }
};