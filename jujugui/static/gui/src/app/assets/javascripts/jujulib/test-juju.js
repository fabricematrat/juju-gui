/* Copyright (C) 2015 Canonical Ltd. */

'use strict';

chai.config.includeStack = true;
chai.config.truncateThreshold = 0;

describe('jujulib', function() {

    describe('environment manager', function() {
        it('exists', function() {
            var env = new window.jujulib.environment();
            assert.isTrue(env instanceof window.jujulib.environment);
        });

        it('can list environments', function(done) {
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    success({target: {responseText: '{"environments": ["foo"]}'}});
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.listEnvironments(function(data) {
                assert.deepEqual(data, ['foo']);
                done(); 
            }, function() {});
        });
        it('can get environment data', function(done) {
            var bakery = {
                sendGetRequest: function(path, ignore, success, failure) {
                    assert.equal(path, 'http://example.com/v1/env/rose/badwolf')
                    success({target: {responseText: '{"uuid": "foo"}'}});
                }
            };
            var env = new window.jujulib.environment('http://example.com', bakery);
            env.getEnvironment('rose', 'badwolf', function(data) {
                assert.deepEqual(data, {uuid: 'foo'});
                done(); 
            }, function() {});
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
