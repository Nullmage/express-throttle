"use strict";

var test = require("tape");
var express = require("express");
var request = require("supertest");

var MemoryStore = require("../lib/memory-store");
var throttle = require("../lib/throttle");

function close_to(value, target, delta = 0.001) {
	return Math.abs(value - target) < delta;
}

test("fail to init...", t => {
	t.test("...without options", st => {
		st.throws(throttle, new Error);
		st.end();
	});

	t.test("...with options not being an object", st => {
		st.throws(() => throttle("options"), new Error);
		st.end();
	});

	t.test("...with 'burst' option not being a number", st => {
		st.throws(() => throttle("5"), new Error);
		st.end();
	});

	t.test("...with 'rate' option not being a string", st => {
		st.throws(() => throttle(5, 10), new Error);
		st.end();
	});

	t.test("...without providing 'burst' option", st => {
		st.throws(() => throttle({ "rate": "1/s" }), new Error);
		st.end();
	});

	t.test("...without providing 'rate' option", st => {
		st.throws(() => throttle({ "burst": 5 }), new Error);
		st.end();
	});

	t.test("...with 'rate' not being in correct format", st => {
		st.throws(() => throttle(5, "x/hour"), new Error);
		st.end();
	});
});

test("successfully init with 'burst' and 'rate'", t => {
	t.doesNotThrow(() => throttle(5, "1/s"));
	t.end();
});

test("make one request", t => {
	var app = express();

	app.get("/", throttle(5, "1/s"), function(req, res) {
		res.status(200).end();
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		t.end();
	});
});

test("custom store", t => {
	var app = express();
	var store = new MemoryStore();

	app.get("/", throttle({
		"burst": 5,
		"rate": "1/s",
		"store": store
	}), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		store.get(res.body, (err, entry) => {
			t.assert(close_to(entry.tokens, 4));
			t.end();
		});
	});
});

test("respect x-forwarded-for header", t => {
	var app = express();
	var store = new MemoryStore();

	app.get("/", throttle({
		"burst": 5,
		"rate": "1/s",
		"store": store
	}), function(req, res) {
		res.status(200).json();
	});

	var proxy_ip = "123.123.123.123";

	request(app).get("/")
	.set("x-forwarded-for", proxy_ip)
	.end((err, res) => {
		t.equal(res.status, 200);
		store.get(proxy_ip, (err, entry) => {
			t.assert(close_to(entry.tokens, 4));
			t.end();
		});
	});
});

test("custom key function", t => {
	var app = express();
	var store = new MemoryStore();
	var custom_key = "custom_key";

	app.get("/", throttle({
		"burst": 5,
		"rate": "1/s",
		"store": store,
		"key": function() {
			return custom_key;
		}
	}), function(req, res) {
		res.status(200).end();
	});

	request(app).get("/").end((err, res) => {
		t.equal(res.status, 200);
		store.get(custom_key, (err, entry) => {
			t.assert(close_to(entry.tokens, 4));
			t.end();
		});
	});
});

test("throttling", t => {
	var app = express();
	var store = new MemoryStore();

	app.get("/", throttle({
		"burst": 1,
		"rate": "1/s",
		"store": store
	}), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	request(app).get("/").end(() => true);
	request(app).get("/").end((err, res) => {
		t.equal(res.status, 429);
	});

	setTimeout(() => {
		request(app).get("/").end((err, res) => {
			store.get(res.body, (err, entry) => {
				t.equal(res.status, 200);
				t.assert(close_to(entry.tokens, 0));
				t.end();
			});
		});
	}, 1000);
});

test("throttling (decimal rate)", t => {
	var app = express();
	var store = new MemoryStore();

	app.get("/", throttle({
		"burst": 1,
		"rate": "2.5/s",
		"store": store
	}), function(req, res) {
		res.status(200).json(req.connection.remoteAddress);
	});

	request(app).get("/").end(() => true);
	request(app).get("/").end((err, res) => {
		t.equal(res.status, 429);
	});

	setTimeout(() => {
		request(app).get("/").end((err, res) => {
			store.get(res.body, (err, entry) => {
				t.equal(res.status, 200);
				t.assert(close_to(entry.tokens, 0));
				t.end();
			});
		});
	}, 400);
});

test("custom on_throttled function", t => {
	var app = express();
	app.get("/", throttle({
		"burst": 1,
		"rate": "1/s",
		"on_throttled": function(req, res) {
			res.status(429).json("slow down!");
		}
	}), function(req, res) {
		res.status(200).end();
	});

	request(app).get("/").end(() => true);
	request(app).get("/").end((err, res) => {
		t.equal(res.status, 429);
		t.equal(res.body, "slow down!");
		t.end();
	});
});
