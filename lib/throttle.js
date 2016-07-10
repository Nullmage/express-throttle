"use strict";

// The throttling is done using the "token bucket" method
// https://en.wikipedia.org/wiki/Token_bucket

// Default token storage (memory-bounded LRU cache)
var MemoryStore = require("./memory-store");

function Throttle(options) {
	var opts = parse_options(options);
	var rate = opts.rate.amount / opts.rate.interval;
	var burst = opts.burst || opts.rate.amount;
	var store = opts.store || new MemoryStore(10000);

	// key function, used to identify the client we are going to throttle
	var key_func = opts.key || function(req) {
		return req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	};

	// cost function, calculates the number of tokens to be subtracted per request
	if (typeof(opts.cost) == "number") {
		var cost_func = function() { return opts.cost; };
	} else if (typeof(opts.cost) == "function") {
		var cost_func = opts.cost;
	} else {
		var cost_func = function() { return 1; };
	}

	var on_throttled = opts.on_throttled || function(req, res) {
		res.status(429).end();
	};
	
	return function(req, res, next) {
		var key = key_func(req);
		var cost = cost_func(req);

		store.get(key, function(err, entry) {
			if (err) {
				return next(err);
			}

			entry = entry || { "tokens": burst };
			var passthrough = consume_tokens(entry, rate, burst, cost);
			store.set(key, entry, function(err) {
				if (err) {
					return next(err);
				}

				if (passthrough) {
					next();
				} else {
					on_throttled(req, res);
				}
			});
		});
	};
}

function shallow_clone(obj) {
	var clone = {};

	for (var key in obj) {
		clone[key] = obj[key];
	}

	return clone;
}

function parse_options(options) {
	if (typeof(options) == "string") {
		options = { "rate": options };
	}

	if (typeof(options) != "object") {
		throw new Error("options needs to be an object.");
	} else {
		options = shallow_clone(options);
	}
	
	if (typeof(options.rate) != "string") {
		throw new Error("'rate' needs to be a string (e.g 3/s, 5/2min, 10/day).");
	}

	options.rate = parse_rate(options.rate);

	if (options.burst && typeof(options.burst) != "number") {
		throw new Error("'burst' needs to be a number.");
	}

	if (options.key && typeof(options.key) != "function") {
		throw new Error("'key' needs to be a function.");
	}
	
	if (options.cost && !(typeof(options.cost) == "number" || typeof(options.cost) == "function")) {
		throw new Error("'cost' needs to be a number or function.");
	}
	
	if (options.on_throttled && typeof(options.on_throttled) != "function") {
		throw new Error("'on_throttled' needs to be a function.");
	}

	return options;
}

var RATE_PATTERN = /^(\d+)\/(\d+)?(s|sec|second|m|min|minute|h|hour|d|day)$/;

function parse_rate(rate) {
	var parsed_rate = rate.match(RATE_PATTERN);

	if (!parsed_rate) {
		throw new Error("invalid rate (e.g 3/s, 5/2min, 10/day).");
	}

	var numerator = parseInt(parsed_rate[1], 10);
	var denominator = parseInt(parsed_rate[2] || 1, 10);
	var time_unit = parsed_rate[3];

	return {
		"amount": numerator,
		"interval": denominator * time_unit_to_ms(time_unit)
	};
}

function time_unit_to_ms(time_unit) {
	switch (time_unit) {
		case "s":
		case "sec":
		case "second":	return 1000;
		case "m":
		case "min":
		case "minute":	return 60 * 1000;
		case "h":
		case "hour":	return 60 * 60 * 1000;
		case "d":
		case "day":		return 24 * 60 * 60 * 1000;
	}
}

function consume_tokens(entry, rate, burst, cost) {
	var now = Date.now();

	// The number of tokens we have refilled since last access
	var new_tokens = rate * (now - (entry.accessed || now));
	entry.accessed = now;

	// Apply the refill first so it doesn't cancel out with the tokens we are
	// about to consume
	entry.tokens = clamp_max(entry.tokens + new_tokens, burst);

	if (entry.tokens >= 1) {
		entry.tokens -= cost;
		return true;
	} else {
		// Not enough tokens, don't remove anything
		return false;
	}
}

function clamp_max(value, max) {
	return value > max ? max : value;
}

module.exports = Throttle;