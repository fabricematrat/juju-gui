/* Copyright (C) 2015 Canonical Ltd. */

'use strict';

chai.config.includeStack = true;
chai.config.truncateThreshold = 0;

describe('jujulib', function() {

    describe('environment manager', function() {
        var _makeXHRRequest = function(obj) {
            return {target: {responseText: JSON.stringify(obj)}};
        };

        it('exists', function() {
            var env = new window.jujulib.environment();
            assert.isTrue(env instanceof window.jujulib.environment);
        });

        it('can list environments', function(done) {
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    var xhr = _makeXHRRequest({environments: ["foo"]});
                    success(xhr);
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.listEnvironments(function(data) {
                assert.deepEqual(data, ['foo']);
                done();
            }, function() {
                assert.fail('failure callback should not have been called.');
                done();
            });
        });

        it('can handle errors listing environments', function(done) {
            var err = 'bad wolf';
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    failure(err);
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.listEnvironments(function(data) {
                assert.fail('success callback should not have been called.');
                done();
            }, function(error) {
                assert.equal(error, err);
                done();
            });
        });

        it('can get environment data', function(done) {
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    assert.equal(path, 'http://example.com/v1/env/rose/fnord')
                    var xhr = _makeXHRRequest({uuid: "foo"});
                    success(xhr);
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.getEnvironment('rose', 'fnord', function(data) {
                assert.deepEqual(data, {uuid: 'foo'});
                done();
            }, function() {});
        });

        it('can handle errors getting environment data', function(done) {
            var err = 'bad wolf';
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    assert.equal(path, 'http://example.com/v1/env/rose/fnord')
                    failure(err);
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.getEnvironment('rose', 'fnord', function(data) {
                assert.fail('success callback should not have been called');
            }, function(error) {
                assert.equal(error, err);
                done();
            });
        });
    });

    describe('charmstore', function() {
        it('exists', function() {
            var cs = new window.jujulib.charmstore();
            assert.isTrue(cs instanceof window.jujulib.charmstore);
        });
    });

    describe('identity manager', function() {
        it('exists', function() {
            var identity = new window.jujulib.identity();
            assert.isTrue(identity instanceof window.jujulib.identity);
        });
    });
});
