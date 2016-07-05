"use strict";

var LRU = require("lru-cache");

function MemoryStore(size) {
	if (!(this instanceof MemoryStore)) {
		return new MemoryStore(size);
	}

	this.cache = new LRU(size);
}

MemoryStore.prototype.get = function(key) {
	return this.cache.get(key);
};

MemoryStore.prototype.set = function(key, value) {
	this.cache.set(key, value);
};

module.exports = MemoryStore;