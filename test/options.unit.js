"use strict";

var tap = require("tap");
var options = require("../lib/options");

function wrap(opts) {
	return function() {
		options.parse(opts);
	}
}

tap.test("no options", function(t) {
	t.throws(wrap());
	t.end();
});

tap.test("options not being an object", function(t) {
	t.throws(wrap(5));
	t.end();
});

tap.test("neither rate nor period specified", function(t) {
	t.throws(wrap({}));
	t.end();
});

tap.test("store_size not being a number", function(t) {
	t.throws(wrap({ "store_size": "5" }));
	t.end();
});

tap.test("invalid rate...", function(t) {
	tap.test("not being a string", function(st) {
		st.throws(wrap({ "rate": 5 }));
		st.end();
	});

	t.test("amount not being a number", function(st) {
		st.throws(wrap({ "rate": "a/m" }));
		st.end();
	});

	t.test("float amount not allowed", function(st) {
		st.throws(wrap({ "rate": "1.0/m" }));
		st.end();
	});

	t.test("negative amount not allowed", function(st) {
		st.throws(wrap({ "rate": "-1/m" }));
		st.end();
	});

	t.test("invalid period", function(st) {
		st.throws(wrap({ "rate": "1/a" }));
		st.end();
	});

	t.test("case sensitive time unit", function(st) {
		st.throws(wrap({ "rate": "1/M" }));
		st.end();
	});

	t.test("float period not allowed", function(st) {
		st.throws(wrap({ "rate": "1/2.0m" }));
		st.end();
	});

	t.test("negative period not allowed", function(st) {
		st.throws(wrap({ "rate": "1/-2m" }));
		st.end();
	});

	t.test("period can't be 0", function(st) {
		st.throws(wrap({ "rate": "1/0m" }));
		st.end();
	});
	
	t.end();
});

tap.test("valid rate...", function(t) {
	t.test("with only time unit", function(st) {
		st.doesNotThrow(wrap({ "rate": "1/s" }));
		st.end();
	});

	t.test("with denominator + time unit", function(st) {
		st.doesNotThrow(wrap({ "rate": "3/2s" }));
		st.end();
	});

	t.end();
});

tap.test("rate + burst not being a number", function(t) {
	t.throws(wrap({ "rate": "1/s", "burst": "5" }));
	t.end();
});

tap.test("burst defaulting to rate.amount", function(t) {
	var burst = options.parse({ "rate": "5/s" }).burst;
	t.equal(burst, 5);
	t.end();
});

tap.test("invalid period...", function(t) {
	t.test("not being a string", function(st) {
		st.throws(wrap({ "period": 10 }));
		st.end();
	});

	t.test("amount not being a number", function(st) {
		st.throws(wrap({ "period": "am" }));
		st.end();
	});

	t.test("case sensitive time unit", function(st) {
		st.throws(wrap({ "period": "1M" }));
		st.end();
	});

	t.test("float amount not allowed", function(st) {
		st.throws(wrap({ "period": "1.0m" }));
		st.end();
	});

	t.test("negative amount not allowed", function(st) {
		st.throws(wrap({ "period": "-1m" }));
		st.end();
	});

	t.test("amount can't be 0", function(st) {
		st.throws(wrap({ "period": "0m" }));
		st.end();
	});

	t.end();
});

tap.test("valid period...", function(t) {
	t.test("with only time unit", function(st) {
		st.doesNotThrow(wrap({ "burst": 1, "period": "s" }));
		st.end();
	});

	t.test("with amount + time unit", function(st) {
		st.doesNotThrow(wrap({ "burst": 1, "period": "2s" }));
		st.end();
	});

	t.end();
});

tap.test("only period specified", function(t) {
	t.throws(wrap({ "period": "10s" }));
	t.end();
});

tap.test("period + burst not being a number", function(t) {
	t.throws(wrap({ "period": "10s", "burst": "5" }));
	t.end();
});

tap.test("key not being a function", function(t) {
	t.throws(wrap({ "rate": "1/s", "key": "ip" }));
	t.end();
});

tap.test("cost not being a number or function", function(t) {
	t.throws(wrap({ "rate": "1/s", "cost": "5" }));
	t.end();
});

tap.test("default cost = 1", function(t) {
	var cost = options.parse({ "rate": "1/s" }).cost();
	t.equal(cost, 1);
	t.end();
});

tap.test("on_allowed not being a function", function(t) {
	t.throws(wrap({ "rate": "1/s", "on_allowed": 5 }));
	t.end();
});

tap.test("on_throttled not being a function", function(t) {
	t.throws(wrap({ "rate": "1/s", "on_throttled": 5 }));
	t.end();
});

tap.test("init with all time units", function(t) {
	t.doesNotThrow(wrap({ "burst": 1, "period": "100ms" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100s" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100sec" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100m" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100min" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100h" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100hour" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100d" }));
	t.doesNotThrow(wrap({ "burst": 1, "period": "100day" }));
	t.end();
});

tap.test("init with everything (rolling)", function(t) {
	t.doesNotThrow(wrap({
		"burst": 10,
		"rate": "5/m",
		"store_size": 100,
		"key": function() {},
		"cost": function() {},
		"on_allowed": function() {},
		"on_throttled": function() {}
	}));

	t.end();
});

tap.test("init with everything (fixed)", function(t) {
	t.doesNotThrow(wrap({
		"burst": 10,
		"period": "5m",
		"store_size": 100,
		"key": function() {},
		"cost": function() {},
		"on_allowed": function() {},
		"on_throttled": function() {}
	}));

	t.end();
});
