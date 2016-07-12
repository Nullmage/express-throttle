"use strict";

var LRU = require("lru-cache");

function MemoryStore(size) {
	this.cache = new LRU(size);
}

MemoryStore.prototype.get = function(key, callback) {
	callback(null, this.cache.get(key));
};

MemoryStore.prototype.set = function(key, value, callback) {
	this.cache.set(key, value);
	callback();
};

module.exports = MemoryStore;