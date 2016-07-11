"use strict";

exports.parse = function parse_options(options) {
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

	if (options.on_allowed && typeof(options.on_allowed) != "function") {
		throw new Error("'on_allowed' needs to be a function.");
	}
	
	if (options.on_throttled && typeof(options.on_throttled) != "function") {
		throw new Error("'on_throttled' needs to be a function.");
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

var RATE_PATTERN = /^(\d+)\/(\d+)?(ms|s|sec|second|m|min|minute|h|hour|d|day)(:fixed)?$/;

function parse_rate(rate) {
	var parsed_rate = rate.match(RATE_PATTERN);

	if (!parsed_rate) {
		throw new Error("invalid rate (e.g 3/s, 5/2min, 10/day).");
	}

	var numerator = parseInt(parsed_rate[1], 10);
	var denominator = parseInt(parsed_rate[2] || 1, 10);
	var time_unit = parsed_rate[3];
	var fixed = parsed_rate[4] == ":fixed";

	return {
		"amount": numerator,
		"period": denominator * time_unit_to_ms(time_unit),
		"fixed": fixed
	};
}

function time_unit_to_ms(time_unit) {
	switch (time_unit) {
		case "ms":
			return 1;
		case "s":	case "sec":	case "second":
			return 1000;
		case "m":	case "min":	case "minute":
			return 60 * 1000;
		case "h":	case "hour":
			return 60 * 60 * 1000;
		case "d":	case "day":
			return 24 * 60 * 60 * 1000;
	}
}
