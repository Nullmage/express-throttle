"use strict";

var MemoryStore = require("./memory-store");

exports.parse = function parse_options(options) {
	if (typeof(options) != "object") {
		throw new Error("options needs to be an object.");
	} else {
		options = shallow_clone(options);
	}

	if (options.store_size && typeof(options.store_size) != "number") {
		throw new Error("'store_size' needs to be a number.");
	}
	
	options.store = options.store || new MemoryStore(options.store_size || 10000);

	if (options.rate) {
		if (typeof(options.rate) != "string") {
			throw new Error("'rate' needs to be a string (e.g 3/s, 5/2min, 10/day).");
		}

		options.rate = parse_rate(options.rate);

		if (options.burst) {
			if (typeof(options.burst) != "number") {
				throw new Error("'burst' needs to be a number.");
			}
		} else {
			options.burst = options.rate.amount;
		}

		add_methods_rolling(options);
	} else if (options.period) {
		if (typeof(options.period) != "string") {
			throw new Error("'period' needs to be a string (e.g 2h, second, 5min).");
		}

		options.period = parse_period(options.period);

		if (typeof(options.burst) != "number") {
			throw new Error("'burst' needs to be a number.");
		}
		
		add_methods_fixed(options);
	} else {
		throw new Error("Either 'rate' or 'period' must be supplied.");
	}

	if (options.key) {
		if (typeof(options.key) != "function") {
			throw new Error("'key' needs to be a function.");
		}
	} else {
		options.key = function(req) { return req.ip; }
	}

	if (options.cost) {
		if (typeof(options.cost) == "number") {
			var cost = options.cost;
			options.cost = function() { return cost; }
		} else if (typeof(options.cost) != "function") {
			throw new Error("'cost' needs to be a number or function.");
		}
	} else {
		options.cost = function() { return 1; }
	}

	if (options.on_allowed) {
		if (typeof(options.on_allowed) != "function") {
			throw new Error("'on_allowed' needs to be a function.");
		}
	} else {
		options.on_allowed = function(req, res, next, bucket) { // eslint-disable-line no-unused-vars
			next();
		};
	}
	
	if (options.on_throttled) {
		if (typeof(options.on_throttled) != "function") {
			throw new Error("'on_throttled' needs to be a function.");
		}
	} else {
		options.on_throttled = function(req, res, next, bucket) { // eslint-disable-line no-unused-vars
			res.status(429).end();
		};
	}

	return options;
};

function shallow_clone(obj) {
	var clone = {};

	for (var key in obj) {
		clone[key] = obj[key];
	}

	return clone;
}

var RATE_PATTERN = /^(\d+)\/(\d+)?(ms|s|sec|m|min|h|hour|d|day)$/;

function parse_rate(rate) {
	var parsed_rate = rate.match(RATE_PATTERN);

	if (!parsed_rate) {
		throw new Error("invalid rate format (e.g 3/s, 5/2min, 10/day).");
	}

	var numerator = parseInt(parsed_rate[1], 10);
	var denominator = parseInt(parsed_rate[2] || 1, 10);

	if (denominator == 0) {
		throw new Error("invalid rate denominator (can't be 0).");
	}

	var time_unit = parsed_rate[3];

	return {
		"amount": numerator,
		"period": denominator * time_unit_to_ms(time_unit)
	};
}

var PERIOD_PATTERN = /^(\d+)?(ms|s|sec|m|min|h|hour|d|day)$/;

function parse_period(period) {
	var parsed_period = period.match(PERIOD_PATTERN);

	if (!parsed_period) {
		throw new Error("invalid period (e.g d, 2m, 3h)")
	}

	var amount = parseInt(parsed_period[1], 10);

	if (amount == 0) {
		throw new Error("invalid period (can't be 0).");
	}

	var time_unit = parsed_period[2];

	return amount * time_unit_to_ms(time_unit);
}

function time_unit_to_ms(time_unit) {
	switch (time_unit) {
		case "ms":
			return 1;
		case "s":	case "sec":
			return 1000;
		case "m":	case "min":
			return 60 * 1000;
		case "h":	case "hour":
			return 60 * 60 * 1000;
		case "d":	case "day":
			return 24 * 60 * 60 * 1000;
	}
}

function add_methods_rolling(options) {
	options.create_bucket = function(ctime) {
		return {
			"tokens": options.burst,
			"mtime": ctime // last modification time
		};
	};

	var rate = options.rate.amount / options.rate.period;
	options.refill_bucket = function(t, bucket) {
		return rate * (t - bucket.mtime);
	}
}

function add_methods_fixed(options) {
	var burst = options.burst;
	var period = options.period;
	options.create_bucket = function(ctime) {
		return {
			"tokens": burst,
			"mtime": ctime,
			"etime": ctime + period // expiration time 
		};
	}

	options.refill_bucket = function(t, bucket) {
		if (t > bucket.etime) {
			bucket.etime = t + period;
			return burst;
		} else {
			return 0;
		}
	}
}
