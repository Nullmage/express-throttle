"use strict";

var test = require("tape");
var express = require("express");
var request = require("supertest");

var MemoryStore = require("../lib/memory-store");
var throttle = require("../lib/throttle");

function close_to(value, target, delta = 0.001) {
	return Math.abs(value - target) < delta;
}

function create_app() {
	var app = express();

	app.get("/", throttle.apply(null, arguments), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	return app;
}

test("fail to init...", t => {
	t.test("...without options", st => {
		st.throws(throttle, new Error);
		st.end();
	});

	t.test("...with first argument not being a string or object", st => {
		st.throws(() => throttle(5), new Error);
		st.end();
	});

	t.test("...with empty option object", st => {
		st.throws(() => throttle({}), new Error);
		st.end();
	});

	t.test("...with 'key' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "burst": 5, "key": 1 }), new Error);
		st.end();
	});

	t.test("...with 'cost' not being a number or function", st => {
		st.throws(() => throttle({ "rate": "1/s", "burst": 5, "cost": "5" }), new Error);
		st.end();
	});

	t.test("...with 'on_throttled' not being a function", st => {
		st.throws(() => throttle({ "rate": "1/s", "burst": 5, "on_throttled": "test" }), new Error);
		st.end();
	});
});

test("init with...", t => {
	t.test("...rate", st => {
		st.doesNotThrow(() => throttle("1/s"));
		st.end();
	});

	t.test("...options object", st => {
		st.doesNotThrow(() => throttle({
			"rate": "1/s",
			"burst": 5,
			"key": () => true,
			"cost": () => true,
			"on_throttled": () => true
		}));
		
		st.end();
	});
});

test("passthrough request...", t => {
	function verify(st) {
		return function(err, res) {
			st.equal(res.status, 200);
			st.end();
		}
	}

	t.test("...rate (integer)", st => {
		var app = create_app("1/s");
		request(app).get("/").end(verify(st));
	});

	t.test("...rate (decimal)", st => {
		var app = create_app("1.0/s");
		request(app).get("/").end(verify(st));
	});

	t.test("...delayed", st => {
		var app = create_app("1/s");
		request(app).get("/").end(() => true);
		setTimeout(() => {
			request(app).get("/").end(verify(st));
		}, 1000);
	});
});

test("throttle request...", t => {
	function verify(st) {
		return function(err, res) {
			st.equal(res.status, 429);
			st.end();
		}
	}

	t.test("...rate (integer)", st => {
		var app = create_app("1/s");
		request(app).get("/").end(() => true);
		request(app).get("/").end(verify(st));
	});

	t.test("...rate (decimal)", st => {
		var app = create_app("1.0/s");
		request(app).get("/").end(() => true);
		request(app).get("/").end(verify(st));
	});

	t.test("...delayed", st => {
		var app = create_app("1/s");
		request(app).get("/").end(() => true);
		setTimeout(() => {
			request(app).get("/").end(verify(st));
		}, 900);
	});
});

test("custom store", t => {
	var store = new MemoryStore();
	var app = create_app({ "rate": "1/s", "store": store })

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		store.get(res.body, (err, entry) => {
			t.ok(entry);
			t.end();
		});
	});
});

test("respect x-forwarded-for header", t => {
	var store = new MemoryStore();
	var proxy_ip = "123.123.123.123";
	var app = create_app({ "rate": "1/s", "store": store });

	request(app).get("/").set("x-forwarded-for", proxy_ip).end((err, res) => {
		t.equal(res.status, 200);
		store.get(proxy_ip, (err, entry) => {
			t.ok(entry);
			t.end();
		});
	});
});

test("custom key function", t => {
	var store = new MemoryStore();
	var custom_key = "custom_key";
	var app = create_app({
		"rate": "1/s",
		"store": store,
		"key": function() { return custom_key }
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		store.get(custom_key, (err, entry) => {
			t.ok(entry);
			t.end();
		});
	});
});

test("custom cost value", t => {
	var store = new MemoryStore();
	var app = create_app({
		"rate": "1/s",
		"burst": 5,
		"store": store,
		"cost": 3
	});

	request(app).get("/").end((err, res) => {
		store.get(res.body, (err, entry) => {
			t.equal(res.status, 200);
			t.assert(close_to(entry.tokens, 2));
			t.end();
		});
	});
});

test("custom cost function", t => {
	var app = express();
	var store = new MemoryStore();

	app.get("/:admin", throttle({
		"burst": 5,
		"rate": "1/s",
		"store": store,
		"cost": function(req) {
			if (req.params.admin == "yes") {
				return 0;
			} else {
				return 3;
			}
		}
	}), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	request(app).get("/yes").end((err, res) => {
		store.get(res.body, (err, entry) => {
			t.equal(res.status, 200);
			t.assert(close_to(entry.tokens, 5));

			request(app).get("/no").end((err, res) => {
				store.get(res.body, (err, entry) => {
					t.equal(res.status, 200);
					t.assert(close_to(entry.tokens, 2));
					t.end();
				});
			});
		});
	});
});

test("custom on_throttled function", t => {
	var app = create_app({
		"rate": "1/s",
		"on_throttled": function(req, res) {
			res.status(503).json("slow down!");
		}
	});

	request(app).get("/").end(() => true);
	request(app).get("/").end((err, res) => {
		t.equal(res.status, 503);
		t.equal(res.body, "slow down!");
		t.end();
	});
});
