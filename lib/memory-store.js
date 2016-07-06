"use strict";

var LRU = require("lru-cache");

function MemoryStore(size) {
	if (!(this instanceof MemoryStore)) {
		return new MemoryStore(size);
	}

	this.cache = new LRU(size);
}

MemoryStore.prototype.get = function(key, callback) {
	var entry = this.cache.get(key);
	callback(null, entry);
};

MemoryStore.prototype.set = function(key, value, callback) {
	this.cache.set(key, value);
	callback();
};

module.exports = MemoryStore;