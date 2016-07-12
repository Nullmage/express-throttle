"use strict";

var test = require("tape");
var throttle = require("../lib/throttle");

test("fail to init...", t => {
	t.test("...without options", st => {
		st.throws(throttle, new Error);
		st.end();
	});

	t.test("...with first argument not being a string or object", st => {
		st.throws(() => throttle(5), new Error);
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", st => {
		st.throws(() => throttle("1.0/h"), new Error);
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", st => {
		st.throws(() => throttle("1/2.0h"), new Error);
		st.end();
	});

	t.test("...with invalid rate option", st => {
		st.throws(() => throttle("10/m:test"), new Error);
		st.end();
	});

	t.test("...with empty option object", st => {
		st.throws(() => throttle({}), new Error);
		st.end();
	});

	t.test("...with 'burst' not being a number", st => {
		st.throws(() => throttle({ "rate": "1/s", "burst": "5" }), new Error);
		st.end();
	});

	t.test("...with 'key' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "key": 1 }), new Error);
		st.end();
	});

	t.test("...with 'cost' not being a number or function", st => {
		st.throws(() => throttle({ "rate": "1/s", "cost": "5" }), new Error);
		st.end();
	});

	t.test("...with 'on_allowed' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "on_allowed": "test" }), new Error);
		st.end();
	});

	t.test("...with 'on_throttled' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "on_throttled": "test" }), new Error);
		st.end();
	});
});

test("init with...", t => {
	t.test("...rate", st => {
		st.doesNotThrow(() => throttle("1/200ms"));
		st.doesNotThrow(() => throttle("1/s"));
		st.doesNotThrow(() => throttle("1/2sec"));
		st.doesNotThrow(() => throttle("1/second"));
		st.doesNotThrow(() => throttle("1/m"));
		st.doesNotThrow(() => throttle("1/3min"));
		st.doesNotThrow(() => throttle("1/minute"));
		st.doesNotThrow(() => throttle("1/4h"));
		st.doesNotThrow(() => throttle("1/hour"));
		st.doesNotThrow(() => throttle("1/d"));
		st.doesNotThrow(() => throttle("1/5day"));
		st.doesNotThrow(() => throttle("1/m:fixed"));
		st.end();
	});

	t.test("...options object", st => {
		st.doesNotThrow(() => throttle({
			"rate": "1/s",
			"burst": 5,
			"key": () => true,
			"cost": () => true,
			"on_allowed": () => true,
			"on_throttled": () => true
		}));
		
		st.end();
	});
});
