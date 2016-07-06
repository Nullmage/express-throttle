"use strict";

// https://en.wikipedia.org/wiki/Token_bucket

var MemoryStore = require("./memory-store");

function Throttle() {
	var options = parse_args(arguments);

	// Memory-bounded LRU cache
	var store = options.store || new MemoryStore(10000);

	// key function, used to identify the client we are going to throttle
	var key_func = options.key || function(req) {
		return req.headers["x-forwarded-for"] || req.connection.remoteAddress;
	};

	// cost function, calculates the number of tokens to be subtracted per request
	var cost_func;
	
	if (typeof(options.cost) == "number") {
		cost_func = function(req) { return options.cost; }
	} else if (typeof(options.cost) == "function") {
		cost_func = options.cost;
	} else {
		cost_func = function(req) { return 1; }
	}

	var on_throttled = options.on_throttled || function(req, res) {
		res.status(429).end();
	};

	return function(req, res, next) {
		var key = key_func(req);
		var cost = cost_func(req);

		store.get(key, function(err, entry) {
			if (err) {
				return next(err);
			}

			entry = entry || { "tokens": options.burst };
			var is_conforming = consume_tokens(entry, options.burst, options.rate, cost);
			store.set(key, entry, function(err) {
				if (err) {
					return next(err);
				}

				if (is_conforming) {
					next();
				} else {
					on_throttled(req, res);
				}
			});
		});
	};
}

function parse_args(args) {
	args = [].slice.call(args); // Convert to array
	var options;

	if (args.length === 1) {
		options = args[0];
	} else if (args.length === 2) {
		options = { "burst": args[0], "rate": args[1] };
	} else {
		throw new Error("invalid number of arguments.");
	}

	if (typeof(options) != "object")
		throw new Error("options needs to be an object.");

	if (typeof(options.burst) != "number")
		throw new Error("'burst' needs to be a number.");
	
	if (typeof(options.rate) != "string")
		throw new Error("'rate' needs to be a string (e.g 2.5/s, 5/min, 10/day).");
	
	if (options.key && typeof(options.key) != "function")
		throw new Error("'key' needs to be a function.")
	
	if (options.cost && !(typeof(options.cost) == "number" || typeof(options.cost) == "function"))
		throw new Error("'cost' needs to be a number or function.");
	
	if (options.on_throttled && typeof(options.on_throttled) != "function")
		throw new Error("'on_throttled' needs to be a function.");
	
	options.rate = parse_rate(options.rate);

	return options;
}

var RATE_PATTERN = /^(\d+(\.\d+)?)\/(s|sec|second|m|min|minute|h|hour|d|day)$/;

function parse_rate(rate) {
	var parsed_rate = rate.match(RATE_PATTERN);

	if (!parsed_rate)
		throw new Error("invalid rate (e.g 2.5/s, 5/min, 10/day).");

	var amount = parseFloat(parsed_rate[1]);
	var time_unit_in_ms = time_unit_to_ms(parsed_rate[3]);

	return amount / time_unit_in_ms;
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

function consume_tokens(entry, burst, rate, cost) {
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