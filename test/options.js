"use strict";

var tap = require("tap");
var throttle = require("../lib/throttle");

tap.test("fail to init...", function(t) {
	t.test("...without options", function(st) {
		st.throws(throttle);
		st.end();
	});

	t.test("...with first argument not being a string or object", function(st) {
		st.throws(function() { throttle(5); });
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", function(st) {
		st.throws(function() { throttle("1.0/h"); });
		st.end();
	});

	t.test("...with invalid rate string (float not allowed)", function(st) {
		st.throws(function() { throttle("1/2.0h"); });
		st.end();
	});

	t.test("...with invalid rate option", function(st) {
		st.throws(function() { throttle("10/m:test"); });
		st.end();
	});

	t.test("...with empty option object", function(st) {
		st.throws(function() { throttle({}); });
		st.end();
	});

	t.test("...with 'burst' not being a number", function(st) {
		st.throws(function() { throttle({ "rate": "1/s", "burst": "5" }); });
		st.end();
	});

	t.test("...with 'key' not being a function", function(st) {
		st.throws(function() { throttle({ "rate": "1/s", "key": 1 }); });
		st.end();
	});

	t.test("...with 'cost' not being a number or function", function(st) {
		st.throws(function() { throttle({ "rate": "1/s", "cost": "5" }); });
		st.end();
	});

	t.test("...with 'on_allowed' not being a function", function(st) {
		st.throws(function() { throttle({ "rate": "1/s", "on_allowed": "test" }); });
		st.end();
	});

	t.test("...with 'on_throttled' not being a function", function(st) {
		st.throws(function() { throttle({ "rate": "1/s", "on_throttled": "test" }); });
		st.end();
	});

	t.end();
});

tap.test("init with...", function(t) {
	t.test("...rate", function(st) {
		st.doesNotThrow(function() { throttle("1/200ms"); });
		st.doesNotThrow(function() { throttle("1/s"); });
		st.doesNotThrow(function() { throttle("1/2sec"); });
		st.doesNotThrow(function() { throttle("1/second"); });
		st.doesNotThrow(function() { throttle("1/m"); });
		st.doesNotThrow(function() { throttle("1/3min"); });
		st.doesNotThrow(function() { throttle("1/minute"); });
		st.doesNotThrow(function() { throttle("1/4h"); });
		st.doesNotThrow(function() { throttle("1/hour"); });
		st.doesNotThrow(function() { throttle("1/d"); });
		st.doesNotThrow(function() { throttle("1/5day"); });
		st.doesNotThrow(function() { throttle("1/m:fixed"); });
		st.end();
	});

	t.test("...options object", function(st) {
		st.doesNotThrow(function() {
			throttle({
				"rate": "1/s",
				"burst": 5,
				"key": function() {},
				"cost": function() {},
				"on_allowed": function() {},
				"on_throttled": function() {}
			});
		});
		
		st.end();
	});

	t.end();
});
