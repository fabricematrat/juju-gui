/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2012-2013 Canonical Ltd.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License version 3, as published by
the Free Software Foundation.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranties of MERCHANTABILITY,
SATISFACTORY QUALITY, or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU Affero
General Public License for more details.

You should have received a copy of the GNU Affero General Public License along
with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

(function() {

  describe('Go Juju environment utilities', function() {
    var environments;

    before(function(done) {
      YUI(GlobalConfig).use(['juju-env-go'], function(Y) {
        environments = Y.namespace('juju.environments');
        done();
      });
    });

    it('provides a way to retrieve a name from an endpoint', function() {
      // Test both an endpoint with a name and one without, as may occur in
      // hand-crafted bundles.
      var endpointA = [
        'foo',
        { name: 'bar' }
      ];
      var endpointB = [
        'bar',
        {}
      ];
      assert.equal('foo:bar', environments.endpointToName(endpointA));
      assert.equal('bar', environments.endpointToName(endpointB));
    });

    it('provides a way to retrieve a relation key from endpoints', function() {
      var endpoints = {
        wordpress: {Name: 'website', Role: 'provider'},
        haproxy: {Name: 'reverseproxy', Role: 'requirer'}
      };
      var key = environments.createRelationKey(endpoints);
      assert.deepEqual('haproxy:reverseproxy wordpress:website', key);
    });

    it('provides a way to lowercase the keys of an object', function() {
      var obj = {Key1: 'value1', key2: 'value2', MyThirdKey: 'value3'},
          expected = {key1: 'value1', key2: 'value2', mythirdkey: 'value3'},
          result = environments.lowerObjectKeys(obj);
      assert.deepEqual(expected, result);
    });

    it('provides a way to convert object values to strings', function() {
      var obj = {key1: 42, key2: false, key3: null, key4: 'foo'},
          expected = {key1: '42', key2: 'false', key3: null, key4: 'foo'},
          result = environments.stringifyObjectValues(obj);
      assert.deepEqual(expected, result);
    });

    describe('parsePlacement', function() {

      it('returns null if there is nothing to parse', function() {
        var placement = environments.parsePlacement('');
        assert.strictEqual(placement, null);
      });

      it('correctly returns the scope and the directive', function() {
        var placement = environments.parsePlacement('lxc:2');
        assert.deepEqual(placement, {Scope: 'lxc', Directive: '2'});
      });

      it('returns a new container placement', function() {
        var placement = environments.parsePlacement('kvm');
        assert.deepEqual(placement, {Scope: 'kvm', Directive: ''});
      });

      it('returns a machine placement', function() {
        var placement = environments.parsePlacement('42');
        assert.deepEqual(placement, {Scope: '#', Directive: '42'});
      });

    });

  });

  describe('Go Juju environment', function() {
    var cleanups, conn, endpointA, endpointB, ecs, env, juju, machineJobs, msg,
        utils, Y;

    before(function(done) {
      Y = YUI(GlobalConfig).use([
        'environment-change-set',
        'juju-tests-utils'
      ], function(Y) {
        juju = Y.namespace('juju');
        utils = Y.namespace('juju-tests.utils');
        machineJobs = Y.namespace('juju.environments').machineJobs;
        done();
      });
    });

    beforeEach(function() {
      conn = new utils.SocketStub();
      ecs = new juju.EnvironmentChangeSet();
      env = new juju.environments.GoEnvironment({
        conn: conn, user: 'user', password: 'password', ecs: ecs
      });
      env.connect();
      env.set('facades', {
        Annotations: [2],
        Client: [1],
        CrossModelRelations: [1],
        ModelManager: [2],
        GUIToken: [46, 47],
        Pinger: [42],
        Service: [3]
      });
      this._cleanups.push(env.close.bind(env));
      cleanups = [];
    });

    afterEach(function()  {
      cleanups.forEach(function(action) {action();});
      // We need to clear any credentials stored in sessionStorage.
      env.setCredentials(null);
      if (env && env.destroy) {env.destroy();}
      if (conn && conn.destroy) {conn.destroy();}
    });

    var noopHandleLogin = function() {
      var oldHandleLogin = Y.juju.environments.GoEnvironment.handleLogin;
      Y.juju.environments.GoEnvironment.handleLogin = function() {};
      cleanups.push(function() {
        Y.juju.environments.GoEnvironment.handleLogin = oldHandleLogin;
      });
    };

    describe('findFacadeVersion', function() {

      beforeEach(function() {
        env.set('facades', {'Test': [0, 1]});
      });

      afterEach(function() {});

      it('returns the version if the version is supported', function() {
        assert.strictEqual(env.findFacadeVersion('Test', 0), 0);
        assert.strictEqual(env.findFacadeVersion('Test', 1), 1);
      });

      it('returns the version if a default version is supported', function() {
        assert.strictEqual(env.findFacadeVersion('ChangeSet', 0), 0);
      });

      it('returns the last version if the facade is supported', function() {
        assert.strictEqual(env.findFacadeVersion('Test'), 1);
      });

      it('returns the version if a default facade is supported', function() {
        assert.strictEqual(env.findFacadeVersion('ChangeSet'), 0);
      });

      it('returns null if a specific version is not supported', function() {
        assert.strictEqual(env.findFacadeVersion('Test', 2), null);
      });

      it('returns null if a default version is not supported', function() {
        assert.strictEqual(env.findFacadeVersion('ChangeSet', 1), null);
      });

      it('returns null if a facade is not supported', function() {
        assert.strictEqual(env.findFacadeVersion('BadWolf'), null);
      });

      it('returns null if a facade version is not supported', function() {
        assert.strictEqual(env.findFacadeVersion('BadWolf', 42), null);
      });

      it('returns the version if a facade is supported (legacy)', function() {
        env.set('facades', undefined);
        assert.strictEqual(env.findFacadeVersion('AllWatcher'), 0);
      });

      it('returns the version if a facade is supported (empty)', function() {
        env.set('facades', {});
        assert.strictEqual(env.findFacadeVersion('Pinger'), 0);
      });

    });

    describe('prepareConstraints', function() {

      it('converts a constraints string to an object', function() {
        var constraints = env.prepareConstraints('tags=foo,bar cpu-cores=4');
        assert.deepEqual(constraints, {
          'cpu-cores': 4,
          'tags': ['foo', 'bar']
        });
      });

      it('converts integer constraints', function() {
        var constraints = env.prepareConstraints(
            {'root-disk': '800', 'cpu-cores': '4', mem: '2000'});
        assert.deepEqual(
            constraints, {'root-disk': 800, 'cpu-cores': 4, mem: 2000});
      });

      it('removes integer constraints with invalid values', function() {
        var constraints = env.prepareConstraints(
            {'cpu-power': 'four kquad', 'cpu-cores': 'tons', mem: 2000});
        assert.deepEqual(constraints, {mem: 2000});
      });

      it('does not remove zero values', function() {
        var constraints = env.prepareConstraints({'root-disk': '0', mem: 0});
        assert.deepEqual(constraints, {'root-disk': 0, mem: 0});
      });

      it('removes empty/undefined/null values', function() {
        var constraints = env.prepareConstraints({
          arch: undefined,
          tags: '',
          mem: ' ',
          'cpu-cores': 4,
          'cpu-power': null
        });
        assert.deepEqual(constraints, {'cpu-cores': 4});
      });

      it('removes unexpected constraints', function() {
        var constraints = env.prepareConstraints(
            {arch: 'i386', invalid: 'not-a-constraint'});
        assert.deepEqual(constraints, {arch: 'i386'});
      });

      it('turns tags into an array', function() {
        var constraints = env.prepareConstraints({tags: 'tag1,tag2,tag3'});
        assert.deepEqual(constraints, {tags: ['tag1', 'tag2', 'tag3']});
      });

      it('removes empty tags', function() {
        var constraints = env.prepareConstraints({tags: 'tag1,,tag3'});
        assert.deepEqual(constraints, {tags: ['tag1', 'tag3']});
      });

      it('handles invalid tags', function() {
        var constraints = env.prepareConstraints({tags: 'tag1,   ,tag2 ,'});
        assert.deepEqual(constraints, {tags: ['tag1', 'tag2']});
      });

      it('returns empty tags if no tags are really passed', function() {
        var constraints = env.prepareConstraints({tags: ' ,    ,   ,,,'});
        assert.deepEqual(constraints, {tags: []});
      });

      it('converts tags with spaces', function() {
        var constraints = env.prepareConstraints(
            {tags: 'first tag, second   tag'});
        assert.deepEqual(constraints, {tags: ['first-tag', 'second-tag']});
      });

      it('does not modify the input constraints in place', function() {
        var input = {'cpu-power': '800', 'cpu-cores': '4', mem: '2000'};
        var backup = Y.clone(input);
        env.prepareConstraints(input);
        assert.deepEqual(input, backup);
      });

    });

    describe('login', function() {
      it('sends the correct login message for juju < 2.0', function() {
        env.set('jujuCoreVersion', '1.23');
        noopHandleLogin();
        env.login();
        var last_message = conn.last_message();
        var expected = {
          Type: 'Admin',
          Request: 'Login',
          RequestId: 1,
          Params: {AuthTag: 'user-user', Password: 'password'},
          Version: 0
        };
        assert.deepEqual(expected, last_message);
      });

      it('sends the correct login message for juju > 2.0', function() {
        env.set('jujuCoreVersion', '2.0');
        noopHandleLogin();
        env.login();
        var last_message = conn.last_message();
        var expected = {
          Type: 'Admin',
          Request: 'Login',
          RequestId: 1,
          Params: {'auth-tag': 'user-user', credentials: 'password'},
          Version: 3
        };
        assert.deepEqual(expected, last_message);
      });

      it('resets the user and password if they are not valid', function() {
        env.login();
        // Assume login to be the first request.
        conn.msg({RequestId: 1, Error: 'Invalid user or password'});
        assert.deepEqual(
          env.getCredentials(), {user: '', password: '', macaroons: null});
        assert.isTrue(env.failedAuthentication);
        assert.isFalse(env.failedTokenAuthentication);
      });

      it('fires a login event on successful login', function() {
        var loginFired = false;
        var result, fromToken;
        env.on('login', function(evt) {
          loginFired = true;
          result = evt.data.result;
          fromToken = evt.data.fromToken;
        });
        env.login();
        // Assume login to be the first request.
        conn.msg({RequestId: 1, Response: {}});
        assert.isTrue(loginFired);
        assert.isTrue(result);
        assert.isFalse(fromToken);
      });

      it('resets failed markers on successful login', function() {
        env.failedAuthentication = env.failedTokenAuthentication = true;
        env.login();
        // Assume login to be the first request.
        conn.msg({RequestId: 1, Response: {}});
        assert.isFalse(env.failedAuthentication);
        assert.isFalse(env.failedTokenAuthentication);
      });

      it('fires a login event on failed login', function() {
        var loginFired = false;
        var result;
        env.on('login', function(evt) {
          loginFired = true;
          result = evt.data.result;
        });
        env.login();
        // Assume login to be the first request.
        conn.msg({RequestId: 1, Error: 'Invalid user or password'});
        assert.isTrue(loginFired);
        assert.isFalse(result);
      });

      it('avoids sending login requests without credentials', function() {
        env.setCredentials(null);
        env.login();
        assert.equal(0, conn.messages.length);
      });

      it('calls environmentInfo and watchAll after login', function() {
        env.login();
        // Assume login to be the first request.
        conn.msg({RequestId: 1, Response: {}});
        var environmentInfoMessage = conn.last_message(2);
        // EnvironmentInfo is the second request.
        var environmentInfoExpected = {
          Type: 'Client',
          Request: 'EnvironmentInfo',
          // Note that facade version here is 0 because the login mock response
          // below is empty.
          Version: 0,
          RequestId: 2,
          Params: {}
        };
        assert.deepEqual(environmentInfoExpected, environmentInfoMessage);
        var watchAllMessage = conn.last_message();
        // EnvironmentInfo is the second request.
        var watchAllExpected = {
          Type: 'Client',
          Request: 'WatchAll',
          // Note that facade version here is 0 because the login mock response
          // below is empty.
          Version: 0,
          RequestId: 3,
          Params: {}
        };
        assert.deepEqual(watchAllExpected, watchAllMessage);
      });
    });

    describe('login with macaroons', function() {
      var error;

      // Create a callback to use when handling responses.
      var callback = function(err) {
        error = err;
      };

      // Create a fake bakery object with the given discharge fuction.
      var makeBakery = function(dischargeFunc) {
        return {discharge: dischargeFunc};
      };

      // Check that the given message sent to the WebSocket is what we expect.
      // Return the request id.
      var assertRequest = function(msg, macaroons) {
        assert.strictEqual(msg.Type, 'Admin');
        assert.strictEqual(msg.Request, 'Login');
        assert.strictEqual(msg.Version, 3);
        if (macaroons) {
          assert.deepEqual(msg.Params, {macaroons: [macaroons]});
        } else {
          assert.deepEqual(msg.Params, {});
        }
        return msg.RequestId;
      };

      beforeEach(function() {
        env.set('jujuCoreVersion', '2.0.0');
        error = '';
      });

      it('does not proceed if a login is pending', function() {
        env.pendingLoginResponse = true;
        env.loginWithMacaroon();
        assert.strictEqual(conn.messages.length, 0, 'unexpected messages');
      });

      it('does not work on Juju < 2', function() {
        env.set('jujuCoreVersion', '1.25');
        env.loginWithMacaroon(makeBakery(), callback);
        assert.strictEqual(conn.messages.length, 0, 'unexpected messages');
        assert.strictEqual(error, 'macaroon auth requires Juju 2');
      });

      it('sends an initial login request without macaroons', function() {
        env.loginWithMacaroon(makeBakery());
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        assertRequest(conn.last_message());
      });

      it('sends an initial login request with macaroons', function() {
        env.setCredentials({macaroons: ['macaroon']});
        env.loginWithMacaroon(makeBakery());
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        assertRequest(conn.last_message(), ['macaroon']);
      });

      it('handles initial response errors', function() {
        env.loginWithMacaroon(makeBakery(), callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(conn.last_message());
        conn.msg({RequestId: requestId, Error: 'bad wolf'});
        assert.strictEqual(error, 'authentication failed: bad wolf');
      });

      it('sends a second message after discharge', function() {
        var bakery = makeBakery(function(macaroon, success, fail) {
          assert.strictEqual(macaroon, 'discharge-required-macaroon');
          success(['macaroon', 'discharge']);
        });
        env.loginWithMacaroon(bakery, callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(conn.last_message());
        conn.msg({
          RequestId: requestId,
          Response: {'discharge-required': 'discharge-required-macaroon'}
        });
        assert.strictEqual(conn.messages.length, 2, 'unexpected msg number');
        assertRequest(conn.last_message(), ['macaroon', 'discharge']);
      });

      it('handles discharge failures', function() {
        var bakery = makeBakery(function(macaroon, success, fail) {
          fail('bad wolf');
        });
        env.loginWithMacaroon(bakery, callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(conn.last_message());
        conn.msg({
          RequestId: requestId,
          Response: {'discharge-required': 'discharge-required-macaroon'}
        });
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        assert.strictEqual(error, 'macaroon discharge failed: bad wolf');
      });

      it('fails if user info is not provided in response', function() {
        env.loginWithMacaroon(makeBakery(), callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(conn.last_message());
        conn.msg({RequestId: requestId, Response: {}});
        assert.strictEqual(
          error, 'authentication failed: use a proper Juju 2 release');
      });

      it('succeeds after discharge', function() {
        var bakery = makeBakery(function(macaroon, success, fail) {
          assert.strictEqual(macaroon, 'discharge-required-macaroon');
          success(['macaroon', 'discharge']);
        });
        env.loginWithMacaroon(bakery, callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(conn.last_message());
        conn.msg({
          RequestId: requestId,
          Response: {'discharge-required': 'discharge-required-macaroon'}
        });
        assert.strictEqual(conn.messages.length, 2, 'unexpected msg number');
        requestId = assertRequest(
          conn.last_message(), ['macaroon', 'discharge']);
        conn.msg({
          RequestId: requestId,
          Response: {
            'user-info': {identity: 'who'},
            'facades': [{Name: 'Client', Versions: [42, 47]}]
          }
        });
        assert.strictEqual(error, null);
        var creds = env.getCredentials();
        assert.strictEqual(creds.user, 'user-who');
        assert.strictEqual(creds.password, '');
        assert.deepEqual(creds.macaroons, ['macaroon', 'discharge']);
        assert.deepEqual(env.get('facades'), {Client: [42, 47]});
      });

      it('succeeds with already stored macaroons', function() {
        env.setCredentials({macaroons: ['already stored', 'macaroons']});
        env.loginWithMacaroon(makeBakery(), callback);
        assert.strictEqual(conn.messages.length, 1, 'unexpected msg number');
        var requestId = assertRequest(
          conn.last_message(), ['already stored', 'macaroons']);
        conn.msg({
          RequestId: requestId,
          Response: {
            'user-info': {identity: 'dalek'},
            'facades': [{Name: 'Client', Versions: [0]}]
          }
        });
        assert.strictEqual(error, null);
        var creds = env.getCredentials();
        assert.strictEqual(creds.user, 'user-dalek');
        assert.strictEqual(creds.password, '');
        assert.deepEqual(creds.macaroons, ['already stored', 'macaroons']);
        assert.deepEqual(env.get('facades'), {Client: [0]});
      });

    });

    describe('tokenLogin', function() {
      it('sends the correct tokenLogin message', function() {
        noopHandleLogin();
        env.tokenLogin('demoToken');
        var last_message = conn.last_message();
        var expected = {
          Type: 'GUIToken',
          Version: 47,
          Request: 'Login',
          RequestId: 1,
          Params: {Token: 'demoToken'}
        };
        assert.deepEqual(expected, last_message);
      });

      it('resets the user and password if the token is not valid', function() {
        env.tokenLogin('badToken');
        // Assume login to be the first request.
        conn.msg({
          RequestId: 1,
          Error: 'unknown, fulfilled, or expired token',
          ErrorCode: 'unauthorized access'
        });
        assert.deepEqual(
          env.getCredentials(), {user: '', password: '', macaroons: null});
        assert.isTrue(env.failedTokenAuthentication);
        assert.isFalse(env.failedAuthentication);
      });

      it('fires a login event on successful token login', function() {
        var loginFired = false;
        var result, fromToken;
        env.on('login', function(evt) {
          loginFired = true;
          result = evt.data.result;
          fromToken = evt.data.fromToken;
        });
        env.tokenLogin('demoToken');
        // Assume login to be the first request.
        conn.msg({
          RequestId: 1,
          Response: {AuthTag: 'tokenuser', Password: 'tokenpasswd'}});
        assert.isTrue(loginFired);
        assert.isTrue(result);
        assert.isTrue(fromToken);
        var credentials = env.getCredentials();
        assert.equal('user-tokenuser', credentials.user);
        assert.equal('tokenpasswd', credentials.password);
      });

      it('resets failed markers on successful login', function() {
        env.failedAuthentication = env.failedTokenAuthentication = true;
        env.tokenLogin('demoToken');
        // Assume login to be the first request.
        conn.msg({
          RequestId: 1,
          Response: {AuthTag: 'tokenuser', Password: 'tokenpasswd'}});
        assert.isFalse(env.failedAuthentication);
        assert.isFalse(env.failedTokenAuthentication);
      });

      it('fires a login event on failed token login', function() {
        var loginFired = false;
        var result;
        env.on('login', function(evt) {
          loginFired = true;
          result = evt.data.result;
        });
        env.tokenLogin('badToken');
        // Assume login to be the first request.
        conn.msg({
          RequestId: 1,
          Error: 'unknown, fulfilled, or expired token',
          ErrorCode: 'unauthorized access'
        });
        assert.isTrue(loginFired);
        assert.isFalse(result);
      });

      it('calls environmentInfo and watchAll after token login', function() {
        env.tokenLogin('demoToken');
        // Assume login to be the first request.
        conn.msg({
          RequestId: 1,
          Response: {AuthTag: 'tokenuser', Password: 'tokenpasswd'}});
        var environmentInfoMessage = conn.last_message(2);
        // EnvironmentInfo is the second request.
        var environmentInfoExpected = {
          Type: 'Client',
          Request: 'EnvironmentInfo',
          Version: 0,
          RequestId: 2,
          Params: {}
        };
        assert.deepEqual(environmentInfoExpected, environmentInfoMessage);
        var watchAllMessage = conn.last_message();
        // EnvironmentInfo is the second request.
        var watchAllExpected = {
          Type: 'Client',
          Version: 0,
          Request: 'WatchAll',
          RequestId: 3,
          Params: {}
        };
        assert.deepEqual(watchAllExpected, watchAllMessage);
      });
    });

    it('sends the correct request for model info', function() {
      env.environmentInfo();
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'ModelInfo',
        Version: 1,
        RequestId: 1,
        Params: {}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct request for legacy environment info', function() {
      env.set('facades', {Client: [0]});
      env.environmentInfo();
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'EnvironmentInfo',
        Version: 0,
        RequestId: 1,
        Params: {}
      };
      assert.deepEqual(expected, last_message);
    });

    it('warns on model info errors', function() {
      env.environmentInfo();
      // Mock "console.warn" so that it is possible to collect warnings.
      var original = console.warn;
      var warning = null;
      console.warn = function(msg) {
        warning = msg;
      };
      // Assume environmentInfo to be the first request.
      conn.msg({RequestId: 1, Error: 'Error retrieving env info.'});
      assert.include(warning, 'Error');
      // Restore the original "console.warn".
      console.warn = original;
    });

    it('stores model info into env attributes', function() {
      env.environmentInfo();
      // Assume environmentInfo to be the first request.
      conn.msg({
        RequestId: 1,
        Response: {
          DefaultSeries: 'precise',
          'ProviderType': 'ec2',
          'Name': 'envname'
        }
      });
      assert.equal('precise', env.get('defaultSeries'));
      assert.equal('ec2', env.get('providerType'));
      assert.equal('envname', env.get('environmentName'));
    });

    it('sends the correct ModelGet request', function() {
      env.environmentGet();
      var expectedMessage = {
        Type: 'Client',
        Request: 'ModelGet',
        Version: 1,
        RequestId: 1,
        Params: {}
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('sends the correct legacy EnvironmentGet request', function() {
      env.set('facades', {Client: [0]});
      env.environmentGet();
      var expectedMessage = {
        Type: 'Client',
        Request: 'EnvironmentGet',
        Version: 0,
        RequestId: 1,
        Params: {}
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('warns on ModelGet errors', function() {
      env.environmentInfo();
      // Mock "console.warn" so that it is possible to collect warnings.
      var original = console.warn;
      var warning = null;
      console.warn = function(msg) {
        warning = msg;
      };
      conn.msg({
        RequestId: 1,
        Response: {
          DefaultSeries: 'precise',
          'ProviderType': 'maas',
          'Name': 'envname'
        }
      });
      conn.msg({RequestId: 2, Error: 'bad wolf'});
      assert.strictEqual(warning, 'error calling ModelGet API: bad wolf');
      // Restore the original "console.warn".
      console.warn = original;
    });

    it('stores the MAAS server on ModelGet results on MAAS', function() {
      env.environmentInfo();
      conn.msg({
        RequestId: 1,
        Response: {
          DefaultSeries: 'trusty',
          'ProviderType': 'maas',
          'Name': 'envname'
        }
      });
      conn.msg({
        RequestId: 2,
        Response: {
          Config: {'maas-server': '1.2.3.4/MAAS'}
        }
      });
      assert.equal(env.get('maasServer'), '1.2.3.4/MAAS');
    });

    it('ignores MAAS data on ModelGet results not in MAAS', function() {
      env.set('providerType', 'ec2');
      env.environmentGet();
      conn.msg({
        RequestId: 1,
        Response: {
          Config: {'maas-server': '1.2.3.4/MAAS'}
        }
      });
      assert.isUndefined(env.get('maasServer'));
    });

    it('calls ModelGet after ModelInfo on MAAS', function() {
      // Simulate an EnvironmentInfo request/response.
      env.environmentInfo();
      conn.msg({
        RequestId: 1,
        Response: {
          DefaultSeries: 'utopic',
          'ProviderType': 'maas',
          'Name': 'envname'
        }
      });
      assert.lengthOf(conn.messages, 2);
      var expectedMessage = {
        Type: 'Client',
        Request: 'ModelGet',
        Version: 1,
        RequestId: 2,
        Params: {}
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('does not call ModelGet after Info when not on MAAS', function() {
      // The MAAS server attribute is initially undefined.
      assert.isUndefined(env.get('maasServer'));
      // Simulate an EnvironmentInfo request/response.
      env.environmentInfo();
      conn.msg({
        RequestId: 1,
        Response: {
          DefaultSeries: 'utopic',
          'ProviderType': 'ec2',
          'Name': 'envname'
        }
      });
      assert.lengthOf(conn.messages, 1);
      // The MAAS server attribute has been set to null.
      assert.isNull(env.get('maasServer'));
    });

    it('destroys models', function(done) {
      // Perform the request.
      env.destroyModel(function(err) {
        assert.strictEqual(err, null);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Client',
          Version: 1,
          Request: 'DestroyModel',
          Params: {},
          RequestId: 1
        });
        done();
      });

      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('handles request failures while destroying models', function(done) {
      // Perform the request.
      env.destroyModel(function(err) {
        assert.strictEqual(err, 'bad wolf');
        done();
      });

      // Mimic response.
      conn.msg({RequestId: 1, Error: 'bad wolf'});
    });

    it('retrieves model info for a single model', function(done) {
      // Perform the request.
      var tag = 'model-5bea955d-7a43-47d3-89dd-b02c923e';
      env.modelInfo([tag], function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.models.length, 1);
        var result = data.models[0];
        assert.strictEqual(result.tag, tag);
        assert.strictEqual(result.name, 'admin');
        assert.strictEqual(result.series, 'trusty');
        assert.strictEqual(result.provider, 'lxd');
        assert.strictEqual(result.uuid, '5bea955d-7a43-47d3-89dd-b02c923e');
        assert.strictEqual(result.serverUuid, '5bea955d-7a43-47d3-89dd');
        assert.strictEqual(result.life, 'alive');
        assert.strictEqual(result.ownerTag, 'user-admin@local');
        assert.strictEqual(result.isAlive, true, 'unexpected zombie model');
        assert.strictEqual(result.isAdmin, false, 'unexpected admin model');
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'ModelManager',
          Version: 2,
          Request: 'ModelInfo',
          Params: {Entities: [{Tag: tag}]},
          RequestId: 1
        });
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            result: {
              DefaultSeries: 'trusty',
              Name: 'admin',
              ProviderType: 'lxd',
              UUID: '5bea955d-7a43-47d3-89dd-b02c923e',
              ServerUUID: '5bea955d-7a43-47d3-89dd',
              Life: 'alive',
              OwnerTag: 'user-admin@local'
            }
          }]
        }
      });
    });

    it('retrieves model info for multiple models', function(done) {
      // Perform the request.
      var tag1 = 'model-5bea955d-7a43-47d3-89dd-tag1';
      var tag2 = 'model-5bea955d-7a43-47d3-89dd-tag2';
      env.modelInfo([tag1, tag2], function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.models.length, 2);
        var result1 = data.models[0];
        assert.strictEqual(result1.tag, tag1);
        assert.strictEqual(result1.name, 'model1');
        assert.strictEqual(result1.series, 'trusty');
        assert.strictEqual(result1.provider, 'lxd');
        assert.strictEqual(result1.uuid, '5bea955d-7a43-47d3-89dd-tag1');
        assert.strictEqual(result1.serverUuid, '5bea955d-7a43-47d3-89dd-tag1');
        assert.strictEqual(result1.life, 'alive');
        assert.strictEqual(result1.ownerTag, 'user-admin@local');
        assert.strictEqual(result1.isAlive, true, 'unexpected zombie model');
        assert.strictEqual(result1.isAdmin, true, 'unexpected regular model');
        var result2 = data.models[1];
        assert.strictEqual(result2.tag, tag2);
        assert.strictEqual(result2.name, 'model2');
        assert.strictEqual(result2.series, 'xenial');
        assert.strictEqual(result2.provider, 'aws');
        assert.strictEqual(result2.uuid, '5bea955d-7a43-47d3-89dd-tag2');
        assert.strictEqual(result2.serverUuid, '5bea955d-7a43-47d3-89dd-tag1');
        assert.strictEqual(result2.life, 'dying');
        assert.strictEqual(result2.ownerTag, 'user-dalek@skaro');
        assert.strictEqual(result2.isAlive, false, 'unexpected alive model');
        assert.strictEqual(result2.isAdmin, false, 'unexpected admin model');
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'ModelManager',
          Version: 2,
          Request: 'ModelInfo',
          Params: {Entities: [{Tag: tag1}, {Tag: tag2}]},
          RequestId: 1
        });
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            result: {
              DefaultSeries: 'trusty',
              Name: 'model1',
              ProviderType: 'lxd',
              UUID: '5bea955d-7a43-47d3-89dd-tag1',
              ServerUUID: '5bea955d-7a43-47d3-89dd-tag1',
              Life: 'alive',
              OwnerTag: 'user-admin@local'
            }
          }, {
            result: {
              DefaultSeries: 'xenial',
              Name: 'model2',
              ProviderType: 'aws',
              UUID: '5bea955d-7a43-47d3-89dd-tag2',
              ServerUUID: '5bea955d-7a43-47d3-89dd-tag1',
              Life: 'dying',
              OwnerTag: 'user-dalek@skaro'
            }
          }]
        }
      });
    });

    it('handles request failures while retrieving model info', function(done) {
      // Perform the request.
      env.modelInfo(['model-5bea955d-7a43-47d3-89dd'], function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: {Message: 'bad wolf'}
      });
    });

    it('handles API failures while retrieving model info', function(done) {
      // Perform the request.
      var tag = 'model-5bea955d-7a43-47d3-89dd';
      env.modelInfo([tag], function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.models.length, 1);
        var result = data.models[0];
        assert.strictEqual(result.tag, tag);
        assert.strictEqual(result.err, 'bad wolf');
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            error: {Message: 'bad wolf'}
          }]
        }
      });
    });

    it('handles unexpected failures while getting model info', function(done) {
      // Perform the request.
      env.modelInfo(['model-5bea955d-7a43-47d3-89dd'], function(data) {
        assert.strictEqual(data.err, 'unexpected results: []');
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {results: []}
      });
    });

    describe('listModelsWithInfo', function() {
      it('listModelsWithInfo: info for a single model', function(done) {
        env.setCredentials({user: 'user-who', password: 'tardis'});
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.strictEqual(err, null);
          assert.strictEqual(data.models.length, 1);
          var result = data.models[0];
          assert.strictEqual(result.err, undefined);
          assert.strictEqual(result.tag, 'model-5bea955d-1');
          assert.strictEqual(result.name, 'admin');
          assert.strictEqual(result.series, 'trusty');
          assert.strictEqual(result.provider, 'lxd');
          assert.strictEqual(result.uuid, '5bea955d-1');
          assert.strictEqual(result.serverUuid, '5bea955d-c');
          assert.strictEqual(result.life, 'alive');
          assert.strictEqual(result.ownerTag, 'user-admin@local');
          assert.strictEqual(result.isAlive, true, 'unexpected zombie model');
          assert.strictEqual(result.isAdmin, false, 'unexpected admin model');
          assert.strictEqual(result.lastConnection, 'today');
          assert.equal(conn.messages.length, 2);
          assert.deepEqual(conn.messages[0], {
            Type: 'ModelManager',
            Version: 2,
            Request: 'ListModels',
            Params: {Tag: 'user-who'},
            RequestId: 1
          });
          assert.deepEqual(conn.messages[1], {
            Type: 'ModelManager',
            Version: 2,
            Request: 'ModelInfo',
            Params: {Entities: [{Tag: 'model-5bea955d-1'}]},
            RequestId: 2
          });
          done();
        });

        // Mimic first response to ModelManager.ListModels.
        conn.msg({
          RequestId: 1,
          Response: {
            UserModels: [{
              Name: 'admin',
              OwnerTag: 'user-who',
              UUID: '5bea955d-1',
              LastConnection: 'today'
            }]
          }
        });
        // Mimic second response to ModelManager.ModelInfo.
        conn.msg({
          RequestId: 2,
          Response: {
            results: [{
              result: {
                DefaultSeries: 'trusty',
                Name: 'admin',
                ProviderType: 'lxd',
                UUID: '5bea955d-1',
                ServerUUID: '5bea955d-c',
                Life: 'alive',
                OwnerTag: 'user-admin@local'
              }
            }]
          }
        });
      });

      it('listModelsWithInfo: info for multiple models', function(done) {
        env.setCredentials({user: 'user-dalek', password: 'exterminate'});
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.strictEqual(err, null);
          assert.strictEqual(data.models.length, 3);
          var result1 = data.models[0];
          assert.strictEqual(result1.err, undefined);
          assert.strictEqual(result1.tag, 'model-5bea955d-1');
          assert.strictEqual(result1.name, 'default');
          assert.strictEqual(result1.series, 'xenial');
          assert.strictEqual(result1.provider, 'lxd');
          assert.strictEqual(result1.uuid, '5bea955d-1');
          assert.strictEqual(result1.serverUuid, '5bea955d-c');
          assert.strictEqual(result1.life, 'dead');
          assert.strictEqual(result1.ownerTag, 'user-dalek@local');
          assert.strictEqual(result1.isAlive, false, 'unexpected alive model');
          assert.strictEqual(result1.isAdmin, false, 'unexpected admin model');
          assert.strictEqual(result1.lastConnection, 'today');
          var result2 = data.models[1];
          assert.strictEqual(result2.err, undefined);
          assert.strictEqual(result2.tag, 'model-5bea955d-c');
          assert.strictEqual(result2.name, 'admin');
          assert.strictEqual(result2.series, 'trusty');
          assert.strictEqual(result2.provider, 'lxd');
          assert.strictEqual(result2.uuid, '5bea955d-c');
          assert.strictEqual(result2.serverUuid, '5bea955d-c');
          assert.strictEqual(result2.life, 'alive');
          assert.strictEqual(result2.ownerTag, 'user-who@local');
          assert.strictEqual(result2.isAlive, true, 'unexpected zombie model');
          assert.strictEqual(result2.isAdmin, true, 'unexpected regular model');
          assert.strictEqual(result2.lastConnection, 'yesterday');
          var result3 = data.models[2];
          assert.strictEqual(result3.err, undefined);
          assert.strictEqual(result3.tag, 'model-5bea955d-3');
          assert.strictEqual(result3.name, 'mymodel');
          assert.strictEqual(result3.series, 'precise');
          assert.strictEqual(result3.provider, 'aws');
          assert.strictEqual(result3.uuid, '5bea955d-3');
          assert.strictEqual(result3.serverUuid, '5bea955d-c');
          assert.strictEqual(result3.life, 'alive');
          assert.strictEqual(result3.ownerTag, 'user-cyberman@local');
          assert.strictEqual(result3.isAlive, true, 'unexpected zombie model');
          assert.strictEqual(result3.isAdmin, false, 'unexpected admin model');
          assert.strictEqual(result3.lastConnection, 'tomorrow');
          assert.equal(conn.messages.length, 2);
          assert.deepEqual(conn.messages[0], {
            Type: 'ModelManager',
            Version: 2,
            Request: 'ListModels',
            Params: {Tag: 'user-dalek'},
            RequestId: 1
          });
          assert.deepEqual(conn.messages[1], {
            Type: 'ModelManager',
            Version: 2,
            Request: 'ModelInfo',
            Params: {Entities: [
              {Tag: 'model-5bea955d-1'},
              {Tag: 'model-5bea955d-c'},
              {Tag: 'model-5bea955d-3'}
            ]},
            RequestId: 2
          });
          done();
        });

        // Mimic first response to ModelManager.ListModels.
        conn.msg({
          RequestId: 1,
          Response: {
            UserModels: [{
              Name: 'default',
              OwnerTag: 'user-dalek',
              UUID: '5bea955d-1',
              LastConnection: 'today'
            }, {
              Name: 'admin',
              OwnerTag: 'user-who',
              UUID: '5bea955d-c',
              LastConnection: 'yesterday'
            }, {
              Name: 'mymodel',
              OwnerTag: 'user-cyberman',
              UUID: '5bea955d-3',
              LastConnection: 'tomorrow'
            }]
          }
        });
        // Mimic second response to ModelManager.ModelInfo.
        conn.msg({
          RequestId: 2,
          Response: {
            results: [{
              result: {
                DefaultSeries: 'xenial',
                Name: 'default',
                ProviderType: 'lxd',
                UUID: '5bea955d-1',
                ServerUUID: '5bea955d-c',
                Life: 'dead',
                OwnerTag: 'user-dalek@local'
              }
            }, {
              result: {
                DefaultSeries: 'trusty',
                Name: 'admin',
                ProviderType: 'lxd',
                UUID: '5bea955d-c',
                ServerUUID: '5bea955d-c',
                Life: 'alive',
                OwnerTag: 'user-who@local'
              }
            }, {
              result: {
                DefaultSeries: 'precise',
                Name: 'mymodel',
                ProviderType: 'aws',
                UUID: '5bea955d-3',
                ServerUUID: '5bea955d-c',
                Life: 'alive',
                OwnerTag: 'user-cyberman@local'
              }
            }]
          }
        });
      });

      it('listModelsWithInfo: credentials error', function(done) {
        env.setCredentials(null);
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.equal(err, 'called without credentials');
          done();
        });
      });

      it('listModelsWithInfo: list models error', function(done) {
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.strictEqual(err, 'bad wolf');
          done();
        });

        // Mimic response.
        conn.msg({
          RequestId: 1,
          Error: 'bad wolf'
        });
      });

      it('listModelsWithInfo: model info error', function(done) {
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.strictEqual(err, 'bad wolf');
          done();
        });

        // Mimic first response to ModelManager.ListModels.
        conn.msg({
          RequestId: 1,
          Response: {
            UserModels: [{
              Name: 'default',
              OwnerTag: 'user-dalek',
              UUID: '5bea955d-1',
              LastConnection: 'today'
            }]
          }
        });
        // Mimic second response to ModelManager.ModelInfo.
        conn.msg({
          RequestId: 2,
          Error: {Message: 'bad wolf'}
        });
      });

      it('listModelsWithInfo: specific model response error', function(done) {
        // Perform the request.
        env.listModelsWithInfo(function(err, data) {
          assert.strictEqual(err, null);
          assert.strictEqual(data.models.length, 1);
          var result = data.models[0];
          assert.strictEqual(result.tag, 'model-5bea955d-1');
          assert.strictEqual(result.err, 'bad wolf');
          done();
        });

        // Mimic first response to ModelManager.ListModels.
        conn.msg({
          RequestId: 1,
          Response: {
            UserModels: [{
              Name: 'default',
              OwnerTag: 'user-dalek',
              UUID: '5bea955d-1',
              LastConnection: 'today'
            }]
          }
        });
        // Mimic second response to ModelManager.ModelInfo.
        conn.msg({
          RequestId: 2,
          Response: {
            results: [{
              error: {Message: 'bad wolf'}
            }]
          }
        });
      });
    });

    it('pings the server correctly', function() {
      env.ping();
      var expectedMessage = {
        Type: 'Pinger',
        Request: 'Ping',
        Version: 42,
        RequestId: 1,
        Params: {}
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('sends the correct Service.AddUnits message', function() {
      env.add_unit('django', 3, null, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'AddUnits',
        Version: 3,
        RequestId: 1,
        Params: {ServiceName: 'django', NumUnits: 3, Placement: [null]}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct legacy AddServiceUnits message', function() {
      env.set('facades', {Client: [1]});
      env.add_unit('django', 3, null, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'AddServiceUnits',
        Version: 1,
        RequestId: 1,
        Params: {ServiceName: 'django', NumUnits: 3, ToMachineSpec: null}
      };
      assert.deepEqual(expected, last_message);
    });

    it('adds new service units to a specific machine', function() {
      env.add_unit('django', 3, '42', null, {immediate: true});
      var expectedMessage = {
        Type: 'Service',
        Request: 'AddUnits',
        Version: 3,
        RequestId: 1,
        Params: {
          ServiceName: 'django',
          NumUnits: 3,
          Placement: [{Scope: '#', Directive: '42'}]
        }
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('adds new service units to a specific container', function() {
      env.add_unit('haproxy', 1, 'lxc:47', null, {immediate: true});
      var expectedMessage = {
        Type: 'Service',
        Request: 'AddUnits',
        Version: 3,
        RequestId: 1,
        Params: {
          ServiceName: 'haproxy',
          NumUnits: 1,
          Placement: [{Scope: 'lxc', Directive: '47'}]
        }
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('adds new service units to a specific machine (legacy)', function() {
      env.set('facades', {Client: [1]});
      env.add_unit('django', 3, '42', null, {immediate: true});
      var expectedMessage = {
        Type: 'Client',
        Request: 'AddServiceUnits',
        Version: 1,
        RequestId: 1,
        Params: {ServiceName: 'django', NumUnits: 3, ToMachineSpec: '42'}
      };
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('successfully adds units to a service', function(done) {
      env.add_unit('django', 2, null, function(data) {
        assert.strictEqual('django', data.service_name);
        assert.strictEqual(2, data.num_units);
        assert.deepEqual(['django/2', 'django/3'], data.result);
        assert.isUndefined(data.err);
        done();
      }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Units: ['django/2', 'django/3']}
      });
    });

    it('handles failures adding units to a service', function(done) {
      env._add_unit('django', 0, null, function(data) {
        assert.strictEqual('django', data.service_name);
        assert.strictEqual(0, data.num_units);
        assert.strictEqual('must add at least one unit', data.err);
        done();
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'must add at least one unit'
      });
    });

    it('sends the correct Service.DestroyUnits message', function() {
      env.remove_units(['django/2', 'django/3'], null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'DestroyUnits',
        Version: 3,
        RequestId: 1,
        Params: {UnitNames: ['django/2', 'django/3']}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct legacy DestroyServiceUnits message', function() {
      env.set('facades', {Service: [2]});
      env.remove_units(['django/2', 'django/3'], null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'DestroyServiceUnits',
        Version: 0,
        RequestId: 1,
        Params: {UnitNames: ['django/2', 'django/3']}
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully removes units from a service', function(done) {
      env.remove_units(['django/2', 'django/3'], function(data) {
        assert.deepEqual(['django/2', 'django/3'], data.unit_names);
        assert.isUndefined(data.err);
        done();
      }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {}
      });
    });

    it('handles failures removing units from a service', function(done) {
      env.remove_units(['django/2'], function(data) {
        assert.deepEqual(['django/2'], data.unit_names);
        assert.strictEqual('unit django/2 does not exist', data.err);
        done();
      }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'unit django/2 does not exist'
      });
    });

    describe('Local charm upload support', function() {

      it('prevents non authorized users from sending files', function(done) {
        env.userIsAuthenticated = false;
        var warn = console.warn,
            called = false;

        console.warn = function(msg) {
          assert.equal(
              msg, 'Attempted upload files without providing credentials.');
          called = true;
        };
        var handler = env.on('login', function(e) {
          assert.deepEqual(e.data, {result: false});
          assert.equal(called, true, 'Console warning not called');
          handler.detach();
          console.warn = warn;
          done();
        });
        env.uploadLocalCharm();
      });

      it('uses the stored webHandler to perform requests', function() {
        env.userIsAuthenticated = true;
        var mockWebHandler = {sendPostRequest: utils.makeStubFunction()};
        env.set('webHandler', mockWebHandler);
        env.uploadLocalCharm(
            'a zip file', 'trusty',
            function() {return 'progress';},
            function() {return 'completed';});
        // Ensure the web handler's sendPostRequest method has been called with
        // the expected arguments.
        assert.strictEqual(mockWebHandler.sendPostRequest.callCount(), 1);
        var lastArguments = mockWebHandler.sendPostRequest.lastArguments();
        assert.strictEqual(lastArguments.length, 7);
        assert.strictEqual(
            lastArguments[0], '/juju-core/charms?series=trusty'); // Path.
        assert.deepEqual(
            lastArguments[1], {'Content-Type': 'application/zip'}); // Headers.
        assert.strictEqual(lastArguments[2], 'a zip file'); // Zip file object.
        assert.strictEqual(lastArguments[3], 'user-user'); // User name.
        assert.strictEqual(lastArguments[4], 'password'); // Password.
        assert.strictEqual(
            lastArguments[5](), 'progress'); // Progress callback.
        assert.strictEqual(
            lastArguments[6](), 'completed'); // Completed callback.
      });

    });

    describe('getLocalCharmFileUrl', function() {

      it('uses the stored webHandler to retrieve the file URL', function() {
        var mockWebHandler = {getUrl: utils.makeStubFunction('myurl')};
        env.set('webHandler', mockWebHandler);
        var url = env.getLocalCharmFileUrl(
            'local:trusty/django-42', 'icon.svg');
        assert.strictEqual(url, 'myurl');
        // Ensure the web handler's getUrl method has been called with the
        // expected arguments.
        assert.strictEqual(mockWebHandler.getUrl.callCount(), 1);
        var lastArguments = mockWebHandler.getUrl.lastArguments();
        assert.lengthOf(lastArguments, 3);
        assert.strictEqual(
            lastArguments[0],
            '/juju-core/charms?url=local:trusty/django-42&file=icon.svg');
        assert.strictEqual(lastArguments[1], 'user-user'); // User name.
        assert.strictEqual(lastArguments[2], 'password'); // Password.
      });

    });

    describe('listLocalCharmFiles', function() {

      it('uses the stored webHandler to retrieve the file list', function() {
        var mockWebHandler = {sendGetRequest: utils.makeStubFunction()};
        env.set('webHandler', mockWebHandler);
        env.listLocalCharmFiles(
            'local:trusty/django-42',
            function() {return 'progress';},
            function() {return 'completed';});
        // Ensure the web handler's sendGetRequest method has been called with
        // the expected arguments.
        assert.strictEqual(mockWebHandler.sendGetRequest.callCount(), 1);
        var lastArguments = mockWebHandler.sendGetRequest.lastArguments();
        assert.lengthOf(lastArguments, 6);
        assert.strictEqual(
            lastArguments[0], '/juju-core/charms?url=local:trusty/django-42');
        assert.deepEqual(lastArguments[1], {}); // Headers.
        assert.strictEqual(lastArguments[2], 'user-user'); // User name.
        assert.strictEqual(lastArguments[3], 'password'); // Password.
        assert.strictEqual(
            lastArguments[4](), 'progress'); // Progress callback.
        assert.strictEqual(
            lastArguments[5](), 'completed'); // Completed callback.
      });

    });

    describe('getLocalCharmFileContents', function() {

      it('uses the stored webHandler to retrieve the contents', function() {
        var mockWebHandler = {sendGetRequest: utils.makeStubFunction()};
        env.set('webHandler', mockWebHandler);
        env.getLocalCharmFileContents(
            'local:trusty/django-42', 'hooks/install',
            function() {return 'progress';},
            function() {return 'completed';});
        // Ensure the web handler's sendGetRequest method has been called with
        // the expected arguments.
        assert.strictEqual(mockWebHandler.sendGetRequest.callCount(), 1);
        var lastArguments = mockWebHandler.sendGetRequest.lastArguments();
        assert.lengthOf(lastArguments, 6);
        assert.strictEqual(
            lastArguments[0],
            '/juju-core/charms?url=local:trusty/django-42&file=hooks/install');
        assert.deepEqual(lastArguments[1], {}); // Headers.
        assert.strictEqual(lastArguments[2], 'user-user'); // User name.
        assert.strictEqual(lastArguments[3], 'password'); // Password.
        assert.strictEqual(
            lastArguments[4](), 'progress'); // Progress callback.
        assert.strictEqual(
            lastArguments[5](), 'completed'); // Completed callback.
      });

    });

    it('sends the correct expose message', function() {
      env.expose('apache', function() {}, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'Expose',
        Version: 3,
        RequestId: 1,
        Params: {ServiceName: 'apache'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct expose message (legacy API)', function() {
      env.set('facades', {});
      env.expose('apache', function() {}, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'ServiceExpose',
        Version: 0,
        RequestId: 1,
        Params: {ServiceName: 'apache'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully exposes a service', function() {
      var service_name;
      env.expose('mysql', function(data) {
        service_name = data.service_name;
      }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {}
      });
      assert.equal(service_name, 'mysql');
    });

    it('handles failed service expose', function() {
      var service_name;
      var err;
      env.expose('mysql', function(data) {
        service_name = data.service_name;
        err = data.err;
      }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'service \"mysql\" not found'
      });
      assert.equal(service_name, 'mysql');
      assert.equal(err, 'service "mysql" not found');
    });

    it('sends the correct unexpose message', function() {
      env.unexpose('apache', function() {}, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'Unexpose',
        Version: 3,
        RequestId: 1,
        Params: {ServiceName: 'apache'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct unexpose message (legacy API)', function() {
      env.set('facades', {});
      env.unexpose('apache', function() {}, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'ServiceUnexpose',
        Version: 0,
        RequestId: 1,
        Params: {ServiceName: 'apache'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully unexposes a service', function() {
      var err;
      var service_name;
      env.unexpose('mysql', function(data) {
        err = data.err;
        service_name = data.service_name;
      }, {immediate: true});
      // Mimic response, assuming ServiceUnexpose to be the first request.
      conn.msg({
        RequestId: 1,
        Response: {}
      });
      assert.isUndefined(err);
      assert.equal(service_name, 'mysql');
    });

    it('handles failed service unexpose', function() {
      var err;
      var service_name;
      env.unexpose('mysql', function(data) {
        err = data.err;
        service_name = data.service_name;
      }, {immediate: true});
      // Mimic response, assuming ServiceUnexpose to be the first request.
      conn.msg({
        RequestId: 1,
        Error: 'service \"mysql\" not found'
      });
      assert.equal(err, 'service "mysql" not found');
      assert.equal(service_name, 'mysql');
    });

    it('successfully adds a charm', function() {
      var err, url;
      env.addCharm('wily/django-42', null, function(data) {
        err = data.err;
        url = data.url;
      }, {immediate: true});
      var expectedMessage = {
        Type: 'Client',
        Version: 1,
        Request: 'AddCharm',
        Params: {URL: 'wily/django-42'},
        RequestId: 1
      };
      assert.deepEqual(expectedMessage, conn.last_message());
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
      assert.strictEqual(url, 'wily/django-42');
      assert.strictEqual(err, undefined);
    });

    it('successfully adds a charm with a macaroon', function() {
      var err, url;
      env.addCharm('trusty/django-0', 'MACAROON', function(data) {
        err = data.err;
        url = data.url;
      }, {immediate: true});
      var expectedMessage = {
        Type: 'Client',
        Request: 'AddCharmWithAuthorization',
        Version: 1,
        Params: {CharmStoreMacaroon: 'MACAROON', URL: 'trusty/django-0'},
        RequestId: 1
      };
      assert.deepEqual(expectedMessage, conn.last_message());
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
      assert.strictEqual(url, 'trusty/django-0');
      assert.strictEqual(err, undefined);
    });

    it('handles failed addCharm calls', function() {
      var err, url;
      env.addCharm('wily/django-42', null, function(data) {
        err = data.err;
        url = data.url;
      }, {immediate: true});
      // Mimic response.
      conn.msg({RequestId: 1, Error: 'bad wolf'});
      assert.strictEqual(url, 'wily/django-42');
      assert.strictEqual(err, 'bad wolf');
    });

    describe('setCharm', function() {

      it('sends message to change the charm version', function() {
        var serviceName = 'rethinkdb';
        var charmUrl = 'trusty/rethinkdb-1';
        var forceUnits = false;
        var forceSeries = true;
        var cb = utils.makeStubFunction();
        env.setCharm(serviceName, charmUrl, forceUnits, forceSeries, cb);
        var lastMessage = conn.last_message();
        var expected = {
          Type: 'Service',
          Request: 'Update',
          Version: 3,
          RequestId: 1,
          Params: {
            ServiceName: serviceName,
            CharmUrl: charmUrl,
            ForceCharmUrl: forceUnits,
            ForceSeries: forceSeries
          }
        };
        assert.deepEqual(lastMessage, expected);
        // Trigger the message.
        conn.msg(expected);
        assert.equal(cb.callCount(), 1);
        assert.deepEqual(cb.lastArguments(), [{
          err: undefined,
          service_name: serviceName,
          charm_url: charmUrl
        }]);
      });

      it('sends message to change the charm charm version(legacy)', function() {
        var serviceName = 'rethinkdb';
        var charmUrl = 'trusty/rethinkdb-1';
        var forceUnits = false;
        var forceSeries = true;
        var cb = utils.makeStubFunction();
        env.get('facades').Service = null;
        env.setCharm(serviceName, charmUrl, forceUnits, forceSeries, cb);
        var lastMessage = conn.last_message();
        var expected = {
          Type: 'Client',
          Request: 'ServiceUpdate',
          Version: 1,
          RequestId: 1,
          Params: {
            ServiceName: serviceName,
            CharmUrl: charmUrl,
            ForceCharmUrl: forceUnits || forceSeries
          }
        };
        assert.deepEqual(lastMessage, expected);
        // Trigger the message.
        conn.msg(expected);
        assert.equal(cb.callCount(), 1);
        assert.deepEqual(cb.lastArguments(), [{
          err: undefined,
          service_name: serviceName,
          charm_url: charmUrl
        }]);
      });

    });

    it('successfully deploys a service', function() {
      env.deploy('precise/mysql', null, null, null, null, null, null, 'precise', null,
          {immediate: true});
      msg = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'Deploy',
        Version: 3,
        Params: {Services: [{
          ServiceName: null,
          ConfigYAML: null,
          Config: {},
          Constraints: {},
          CharmUrl: 'precise/mysql',
          NumUnits: null,
          ToMachineSpec: null,
          Series: 'precise'
        }]},
        RequestId: 1
      };
      assert.deepEqual(expected, msg);
    });

    it('successfully deploys a service (version 2 API)', function() {
      env.set('facades', {'Service': [2]});
      env.deploy('precise/mysql', null, null, null, null, null, null,
        'precise', null, {immediate: true});
      msg = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'ServicesDeploy',
        Version: 2,
        Params: {Services: [{
          ServiceName: null,
          ConfigYAML: null,
          Config: {},
          Constraints: {},
          CharmUrl: 'precise/mysql',
          NumUnits: null,
          ToMachineSpec: null,
          Series: 'precise'
        }]},
        RequestId: 1
      };
      assert.deepEqual(expected, msg);
    });

    it('successfully deploys a service (legacy API)', function() {
      env.set('facades', {});
      env.deploy('precise/mysql', null, null, null, null, null, null,
        'precise', null, {immediate: true});
      msg = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'ServiceDeploy',
        Params: {
          ServiceName: null,
          ConfigYAML: null,
          Config: {},
          Constraints: {},
          CharmUrl: 'precise/mysql',
          NumUnits: null,
          ToMachineSpec: null,
          Series: 'precise'
        },
        RequestId: 1
      };
      assert.deepEqual(expected, msg);
    });

    it('successfully deploys a service with a config object', function() {
      var config = {debug: true, logo: 'example.com/mylogo.png'};
      var expected = {
        Type: 'Service',
        Request: 'Deploy',
        Version: 3,
        Params: {Services: [{
          ServiceName: null,
          // Configuration values are sent as strings.
          Config: {debug: 'true', logo: 'example.com/mylogo.png'},
          ConfigYAML: null,
          Constraints: {},
          CharmUrl: 'precise/mediawiki',
          NumUnits: null,
          ToMachineSpec: null,
          Series: 'precise',
        }]},
        RequestId: 1
      };
      env.deploy('precise/mediawiki', null, config, null, null, null, null,
          'precise', null, {immediate: true});
      msg = conn.last_message();
      assert.deepEqual(expected, msg);
    });

    it('successfully deploys a service with a config file', function() {
      var config_raw = 'tuning-level: \nexpert-mojo';
      var expected = {
        Type: 'Service',
        Request: 'Deploy',
        Version: 3,
        Params: {Services: [{
          ServiceName: null,
          Config: {},
          Constraints: {},
          ConfigYAML: config_raw,
          CharmUrl: 'precise/mysql',
          NumUnits: null,
          ToMachineSpec: null,
          Series: 'precise'
        }]},
        RequestId: 1
      };
      env.deploy('precise/mysql', null, null, config_raw, null, null, null,
          'precise', null, {immediate: true});
      msg = conn.last_message();
      assert.deepEqual(expected, msg);
    });

    it('successfully deploys a service with constraints', function() {
      var constraints = {
        'cpu-cores': 1,
        'cpu-power': 0,
        mem: '512M',
        arch: 'i386',
        'root-disk': '8000',
        tags: 'tag1,tag2'
      };
      env.deploy('precise/mediawiki', null, null, null, 1, constraints, null,
          'precise', null, {immediate: true});
      msg = conn.last_message();
      assert.deepEqual(msg.Params.Services[0].Constraints, {
        'cpu-cores': 1,
        'cpu-power': 0,
        mem: 512,
        arch: 'i386',
        'root-disk': 8000,
        tags: ['tag1', 'tag2']
      });
    });

    it('successfully deploys a service to a specific machine', function() {
      var expectedMessage = {
        Type: 'Service',
        Request: 'Deploy',
        Version: 3,
        Params: {Services: [{
          ServiceName: null,
          ConfigYAML: null,
          Config: {},
          Constraints: {},
          CharmUrl: 'precise/mediawiki',
          NumUnits: 1,
          ToMachineSpec: '42',
          Series: 'precise'
        }]},
        RequestId: 1
      };
      env.deploy('precise/mediawiki', null, null, null, 1, null, '42',
        'precise', null, {immediate: true});
      assert.deepEqual(conn.last_message(), expectedMessage);
    });

    it('successfully deploys a service storing charm data', function() {
      var charm_url;
      var err;
      var service_name;
      env.deploy(
          'precise/mysql', 'mysql', null, null, null, null, null, 'precise',
          function(data) {
            charm_url = data.charm_url;
            err = data.err;
            service_name = data.service_name;
          }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{}]}
      });
      assert.equal(charm_url, 'precise/mysql');
      assert.isUndefined(err);
      assert.equal(service_name, 'mysql');
    });

    it('successfully deploys a service storing legacy charm data', function() {
      env.set('facades', env.defaultFacades);
      var charm_url;
      var err;
      var service_name;
      env.deploy(
          'precise/mysql', 'mysql', null, null, null, null, null, 'precise',
          function(data) {
            charm_url = data.charm_url;
            err = data.err;
            service_name = data.service_name;
          }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {}
      });
      assert.equal(charm_url, 'precise/mysql');
      assert.isUndefined(err);
      assert.equal(service_name, 'mysql');
    });

    it('handles failed service deploy', function() {
      var err;
      env.deploy(
          'precise/mysql', 'mysql', null, null, null, null, null, 'precise',
          function(data) {
            err = data.err;
          }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{Error: 'service "mysql" not found'}]}
      });
      assert.equal(err, 'service "mysql" not found');
    });

    it('handles failed service deploy (legacy API)', function() {
      env.set('facades', env.defaultFacades);
      var err;
      env.deploy(
          'precise/mysql', 'mysql', null, null, null, null, null, 'precise',
          function(data) {
            err = data.err;
          }, {immediate: true});
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'service "mysql" not found'
      });
      assert.equal(err, 'service "mysql" not found');
    });

    it('adds a machine', function() {
      env.addMachines([{}], null, {immediate: true});
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'AddMachines',
        Params: {
          MachineParams: [{Jobs: [machineJobs.HOST_UNITS]}]
        }
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    });

    it('adds a machine with the given series and constraints', function() {
      var constraints = {'cpu-cores': 4, 'mem': 4000};
      env.addMachines([{series: 'trusty', constraints: constraints}], null,
          {immediate: true});
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'AddMachines',
        Params: {
          MachineParams: [{
            Jobs: [machineJobs.HOST_UNITS],
            Series: 'trusty',
            Constraints: constraints
          }]

        }
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    });

    it('adds a container', function() {
      env.addMachines([{containerType: 'lxc'}], null, {immediate: true});
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'AddMachines',
        Params: {
          MachineParams: [{
            Jobs: [machineJobs.HOST_UNITS],
            ContainerType: 'lxc'
          }]
        }
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    });

    it('adds a saucy container to a specific machine', function() {
      env.addMachines(
          [{containerType: 'lxc', parentId: '42', series: 'saucy'}],
          null, {immediate: true});
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'AddMachines',
        Params: {
          MachineParams: [{
            Jobs: [machineJobs.HOST_UNITS],
            ContainerType: 'lxc',
            ParentId: '42',
            Series: 'saucy'
          }]
        }
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    });

    it('adds multiple machines/containers', function() {
      env.addMachines([
        {},
        {jobs: [machineJobs.MANAGE_ENVIRON], series: 'precise'},
        {containerType: 'kvm'},
        {containerType: 'lxc', parentId: '1'}
      ], null, {immediate: true});
      var expectedMachineParams = [
          {Jobs: [machineJobs.HOST_UNITS]},
          {Jobs: [machineJobs.MANAGE_ENVIRON], Series: 'precise'},
          {Jobs: [machineJobs.HOST_UNITS], ContainerType: 'kvm'},
          {Jobs: [machineJobs.HOST_UNITS], ContainerType: 'lxc', ParentId: '1' }
      ];
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'AddMachines',
        Params: {MachineParams: expectedMachineParams}
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    });

    it('avoids sending calls if no machines are added', function() {
      env.addMachines([], null, {immediate: true});
      assert.equal(conn.messages.length, 0);
    });

    it('handles successful addMachines server responses', function() {
      var response;
      env.addMachines([{}, {containerType: 'lxc'}], function(data) {
        response = data;
      }, {immediate: true});
      // Mimic the server AddMachines response.
      conn.msg({
        RequestId: 1,
        Response: {Machines: [{Machine: '42'}, {Machine: '2/lxc/1'}]}
      });
      assert.isUndefined(response.err);
      var expectedMachines = [
        {name: '42', err: null},
        {name: '2/lxc/1', err: null}
      ];
      assert.deepEqual(response.machines, expectedMachines);
    });

    it('handles addMachines server failures', function() {
      var response;
      env.addMachines([{}], function(data) {
        response = data;
      }, {immediate: true});
      // Mimic the server AddMachines response.
      conn.msg({
        RequestId: 1,
        Error: 'bad wolf',
        Response: {Machines: []}
      });
      assert.strictEqual(response.err, 'bad wolf');
      assert.strictEqual(response.machines.length, 0);
    });

    it('handles addMachines errors adding a specific machine', function() {
      var response;
      env.addMachines([{}, {}, {parentId: '42'}], function(data) {
        response = data;
      }, {immediate: true});
      // Mimic the server AddMachines response.
      conn.msg({
        RequestId: 1,
        Response: {
          Machines: [
            {Machine: '', Error: {Code: '', Message: 'bad wolf'}},
            {Machine: '', Error: {Code: '47', Message: 'machine 42 not found'}}
          ]
        }
      });
      assert.isUndefined(response.err);
      var expectedMachines = [
        {name: '', err: 'bad wolf'},
        {name: '', err: 'machine 42 not found (code 47)'}
      ];
      assert.deepEqual(response.machines, expectedMachines);
    });

    // Ensure a destroyMachines request has been sent.
    var assertDestroyMachinesRequestSent = function(names, force) {
      var expectedMsg = {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'DestroyMachines',
        Params: {MachineNames: names, Force: force}
      };
      assert.deepEqual(conn.last_message(), expectedMsg);
    };

    it('removes a machine', function() {
      env.destroyMachines(['1'], null, null, {immediate: true});
      assertDestroyMachinesRequestSent(['1'], false);
    });

    it('forces a machine removal', function() {
      env.destroyMachines(['42'], true, null, {immediate: true});
      assertDestroyMachinesRequestSent(['42'], true);
    });

    it('removes a container', function() {
      env.destroyMachines(['2/lxc/0'], null, null, {immediate: true});
      assertDestroyMachinesRequestSent(['2/lxc/0'], false);
    });

    it('forces a container removal', function() {
      env.destroyMachines(['1/kvm/42'], true, null, {immediate: true});
      assertDestroyMachinesRequestSent(['1/kvm/42'], true);
    });

    it('removes multiple machines/containers', function() {
      env.destroyMachines(['1', '47', '42/lxc/0'], null, null,
          {immediate: true});
      assertDestroyMachinesRequestSent(['1', '47', '42/lxc/0'], false);
    });

    it('avoids sending calls if no machines are removed', function() {
      env.destroyMachines([], null, null, {immediate: true});
      assert.equal(conn.messages.length, 0);
    });

    it('handles successful destroyMachines server responses', function() {
      var response;
      env.destroyMachines(['42', '1/lxc/2'], false, function(data) {
        response = data;
      }, {immediate: true});
      // Mimic the server DestroyMachines response.
      conn.msg({RequestId: 1, Response: {}});
      assert.isUndefined(response.err);
      assert.deepEqual(response.names, ['42', '1/lxc/2']);
    });

    it('handles destroyMachines server failures', function() {
      var response;
      env.destroyMachines(['1'], false, function(data) {
        response = data;
      }, {immediate: true});
      // Mimic the server DestroyMachines response.
      conn.msg({RequestId: 1, Error: 'bad wolf', Response: {}});
      assert.strictEqual(response.err, 'bad wolf');
      assert.deepEqual(response.names, ['1']);
    });

    it('sends the correct Annotations.Get message', function() {
      env.get_annotations('apache', 'service');
      var last_message = conn.last_message();
      var expected = {
        Type: 'Annotations',
        Version: 2,
        Request: 'Get',
        RequestId: 1,
        Params: {Entities: [{Tag: 'service-apache'}]}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct legacy Client.GetAnnotations message', function() {
      env.set('facades', {});
      env.get_annotations('apache', 'service');
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'GetAnnotations',
        RequestId: 1,
        Params: {Tag: 'service-apache'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct Annotations.Set message', function() {
      env.update_annotations('apache', 'service', {'mykey': 'myvalue'});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Annotations',
        Version: 2,
        Request: 'Set',
        RequestId: 1,
        Params: {
          Annotations: [{
            EntityTag: 'service-apache',
            Annotations: {mykey: 'myvalue'}
          }]
        }
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct legacy Client.SetAnnotations message', function() {
      env.set('facades', {});
      env.update_annotations('apache', 'service', {'mykey': 'myvalue'});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'SetAnnotations',
        RequestId: 1,
        Params: {
          Tag: 'service-apache',
          Pairs: {
            mykey: 'myvalue'
          }
        }
      };
      assert.deepEqual(expected, last_message);
    });

    it('correctly sends all the annotation values as strings', function() {
      var annotations = {mynumber: 42, mybool: true, mystring: 'string'},
          expected = {mynumber: '42', mybool: 'true', mystring: 'string'};
      env.update_annotations('apache', 'service', annotations);
      var msg = conn.last_message();
      var pairs = msg.Params.Annotations[0].Annotations;
      assert.deepEqual(expected, pairs);
    });

    it('sends correct multiple update_annotations messages', function() {
      env.update_annotations('apache', 'service', {
        'key1': 'value1',
        'key2': 'value2'
      });
      var expectedMessage = {
        Type: 'Annotations',
        Version: 2,
        Request: 'Set',
        RequestId: 1,
        Params: {
          Annotations: [{
            EntityTag: 'service-apache',
            Annotations: {'key1': 'value1', 'key2': 'value2'}
          }]
        }
      };
      assert.deepEqual([expectedMessage], conn.messages);
    });

    it('sends the correct message to remove annotations', function() {
      env.remove_annotations('apache', 'service', ['key1', 'key2']);
      var last_message = conn.last_message();
      var expected = {
        Type: 'Annotations',
        Version: 2,
        Request: 'Set',
        RequestId: 1,
        Params: {
          Annotations: [{
            EntityTag: 'service-apache',
            Annotations: {'key1': '', 'key2': ''}
          }]
        }
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct message to remove annotations (legacy)', function() {
      env.set('facades', {});
      env.remove_annotations('apache', 'service', ['key1', 'key2']);
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'SetAnnotations',
        RequestId: 1,
        Params: {
          Tag: 'service-apache',
          Pairs: {
            key1: '',
            key2: ''
          }
        }
      };
      assert.deepEqual(expected, last_message);
    });


    it('successfully retrieves annotations', function() {
      var annotations;
      var expected = {
        'key1': 'value1',
        'key2': 'value2'
      };
      env.get_annotations('mysql', 'service', function(data) {
        annotations = data.results;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Results: [{Annotations: expected}]
        }
      });
      assert.deepEqual(expected, annotations);
    });

    it('successfully sets annotation', function() {
      var err;
      env.update_annotations('mysql', 'service', {'mykey': 'myvalue'},
          function(data) {
            err = data.err;
          });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{}]}
      });
      assert.isUndefined(err);
    });

    it('successfully sets multiple annotations', function() {
      var err;
      env.update_annotations('mysql', 'service', {
        'key1': 'value1',
        'key2': 'value2'
      }, function(data) {
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{}]}
      });
      assert.isUndefined(err);
    });

    it('successfully removes annotations', function() {
      var err;
      env.remove_annotations('mysql', 'service', ['key1', 'key2'],
          function(data) {
            err = data.err;
          });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{}]}
      });
      assert.isUndefined(err);
    });

    it('handles errors from getting annotations', function() {
      var err;
      env.get_annotations('haproxy', 'service', function(data) {
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'This is an error.'
      });
      assert.equal('This is an error.', err);
    });

    it('handles internal errors from getting annotations', function() {
      var err;
      env.get_annotations('haproxy', 'service', function(data) {
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Results: [{Error: 'bad wolf'}]
        }
      });
      assert.equal('bad wolf', err);
    });

    it('handles errors from setting annotations', function() {
      var err;
      env.update_annotations('haproxy', 'service', {
        'key': 'value'
      }, function(data) {
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'This is an error.'
      });
      assert.equal('This is an error.', err);
    });

    it('handles internal errors from setting annotations', function() {
      var err;
      env.update_annotations('haproxy', 'service', {
        'key': 'value'
      }, function(data) {
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {Results: [{Error: 'bad wolf'}]}
      });
      assert.equal('bad wolf', err);
    });

    it('correctly handles errors from removing annotations', function() {
      var err;
      env.remove_annotations('haproxy', 'service', ['key1', 'key2'],
          function(data) {
            err = data.err;
          });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'This is an error.'
      });
      assert.equal('This is an error.', err);
    });

    it('sends the correct get_service message', function() {
      env.get_service('mysql');
      var last_message = conn.last_message();
      var expected = {
        RequestId: 1,
        Type: 'Service',
        Version: 3,
        Request: 'Get',
        Params: {ServiceName: 'mysql'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct get_service message (legacy API)', function() {
      env.set('facades', {'Client': [0]});
      env.get_service('mysql');
      var last_message = conn.last_message();
      var expected = {
        RequestId: 1,
        Type: 'Client',
        Version: 0,
        Request: 'ServiceGet',
        Params: {ServiceName: 'mysql'}
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully gets service configuration', function() {
      var service_name, result;
      env.get_service('mysql', function(data) {
        service_name = data.service_name;
        result = data.result;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Service: 'mysql',
          Charm: 'mysql',
          Config: {
            'binlog-format': {
              description: 'Yada, yada, yada.',
              type: 'string',
              value: 'gzip'
            }
          }
        }
      });
      assert.equal(service_name, 'mysql');
      var expected = {
        config: {
          'binlog-format': 'gzip'
        },
        constraints: undefined
      };
      assert.strictEqual('mysql', service_name);
      assert.deepEqual(expected, result);
    });

    it('handles failed get service', function() {
      var service_name;
      var err;
      env.get_service('yoursql', function(data) {
        service_name = data.service_name;
        err = data.err;
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'service \"yoursql\" not found',
        Response: {
          Service: 'yoursql'
        }
      });
      assert.equal(service_name, 'yoursql');
      assert.equal(err, 'service "yoursql" not found');
    });

    it('can set a service config', function() {
      var settings = {'cfg-key': 'cfg-val', 'unchanged': 'bar'};
      var callback = null;
      env.set_config('mysql', settings, callback, {immediate: true});
      msg = conn.last_message();
      var expected = {
        Type: 'Service',
        Request: 'Update',
        Version: 3,
        Params: {
          ServiceName: 'mysql',
          SettingsStrings: {
            'cfg-key': 'cfg-val',
            'unchanged': 'bar'
          }
        },
        RequestId: msg.RequestId
      };
      assert.deepEqual(expected, msg);
    });

    it('can set a service config (legacy API)', function() {
      env.set('facades', {});
      var settings = {'cfg-key': 'cfg-val', 'unchanged': 'bar'};
      var callback = null;
      env.set_config('mysql', settings, callback, {immediate: true});
      msg = conn.last_message();
      var expected = {
        Type: 'Client',
        Request: 'ServiceUpdate',
        Version: 0,
        Params: {
          ServiceName: 'mysql',
          SettingsStrings: {
            'cfg-key': 'cfg-val',
            'unchanged': 'bar'
          }
        },
        RequestId: msg.RequestId
      };
      assert.deepEqual(expected, msg);
    });

    it('handles failed set config', function() {
      var err, service_name;
      env.set_config('yoursql', {}, function(evt) {
        err = evt.err;
        service_name = evt.service_name;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'service "yoursql" not found'
      });
      assert.equal(err, 'service "yoursql" not found');
      assert.equal(service_name, 'yoursql');
    });

    it('handles successful set config', function() {
      var dataReturned;
      var settings = {key1: 'value1', key2: 'value2', key3: 'value3'};
      env.set_config('django', settings, function(evt) {
        dataReturned = evt;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Response: {}
      });
      assert.strictEqual(dataReturned.err, undefined);
      assert.strictEqual(dataReturned.service_name, 'django');
      assert.deepEqual(dataReturned.newValues, settings);
    });

    it('can destroy a service', function() {
      var service_name = '';
      env.destroy_service('mysql', function(evt) {
        service_name = evt.service_name;
      }, {immediate: true});
      var expected = {
        Type: 'Service',
        Version: 3,
        Request: 'Destroy',
        Params: {
          ServiceName: 'mysql'
        },
        RequestId: msg.RequestId
      };
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'service "yoursql" not found'
      });
      assert.deepEqual(expected, msg);
      assert.equal(service_name, 'mysql');
    });

    it('can destroy a service using legacy Client API', function() {
      env.set('facades', {Client: [2]});
      var service_name = '';
      env.destroy_service('mysql', function(evt) {
        service_name = evt.service_name;
      }, {immediate: true});
      var expected = {
        Type: 'Client',
        Version: 2,
        Request: 'ServiceDestroy',
        Params: {
          ServiceName: 'mysql'
        },
        RequestId: msg.RequestId
      };
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'service "yoursql" not found'
      });
      assert.deepEqual(expected, msg);
      assert.equal(service_name, 'mysql');
    });

    it('handles failed destroy service', function() {
      var err, service_name;
      env.destroy_service('yoursql', function(evt) {
        err = evt.err;
        service_name = evt.service_name;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'service "yoursql" not found'
      });
      assert.equal(err, 'service "yoursql" not found');
      assert.equal(service_name, 'yoursql');
    });

    it('sends the correct AddRelation message', function() {
      endpointA = ['haproxy', {name: 'reverseproxy'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.add_relation(endpointA, endpointB, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Version: 3,
        Request: 'AddRelation',
        Params: {
          Endpoints: ['haproxy:reverseproxy', 'wordpress:website']
        },
        RequestId: 1
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct AddRelation message (legacy API)', function() {
      env.set('facades', {});
      endpointA = ['haproxy', {name: 'reverseproxy'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.add_relation(endpointA, endpointB, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'AddRelation',
        Params: {
          Endpoints: ['haproxy:reverseproxy', 'wordpress:website']
        },
        RequestId: 1
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully adds a relation', function() {
      var endpoints, result;
      var jujuEndpoints = {};
      endpointA = ['haproxy', {name: 'reverseproxy'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.add_relation(endpointA, endpointB, function(ev) {
        result = ev.result;
      }, {immediate: true});
      msg = conn.last_message();
      jujuEndpoints.haproxy = {
        Name: 'reverseproxy',
        Interface: 'http',
        Scope: 'global',
        Role: 'requirer'
      };
      jujuEndpoints.wordpress = {
        Name: 'website',
        Interface: 'http',
        Scope: 'global',
        Role: 'provider'
      };
      conn.msg({
        RequestId: msg.RequestId,
        Response: {
          Endpoints: jujuEndpoints
        }
      });
      assert.equal(result.id, 'haproxy:reverseproxy wordpress:website');
      assert.equal(result['interface'], 'http');
      assert.equal(result.scope, 'global');
      endpoints = result.endpoints;
      assert.deepEqual(endpoints[0], {'haproxy': {'name': 'reverseproxy'}});
      assert.deepEqual(endpoints[1], {'wordpress': {'name': 'website'}});
    });

    it('handles failed relation adding', function() {
      var evt;
      endpointA = ['haproxy', {name: 'reverseproxy'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.add_relation(endpointA, endpointB, function(ev) {
        evt = ev;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'cannot add relation'
      });
      assert.equal(evt.err, 'cannot add relation');
      assert.equal(evt.endpoint_a, 'haproxy:reverseproxy');
      assert.equal(evt.endpoint_b, 'wordpress:website');
    });

    it('sends the correct DestroyRelation message', function() {
      endpointA = ['mysql', {name: 'database'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.remove_relation(endpointA, endpointB, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Service',
        Version: 3,
        Request: 'DestroyRelation',
        Params: {
          Endpoints: [
            'mysql:database',
            'wordpress:website'
          ]
        },
        RequestId: 1
      };
      assert.deepEqual(expected, last_message);
    });

    it('sends the correct DestroyRelation message (legacy API)', function() {
      env.set('facades', {});
      endpointA = ['mysql', {name: 'database'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.remove_relation(endpointA, endpointB, null, {immediate: true});
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 0,
        Request: 'DestroyRelation',
        Params: {
          Endpoints: [
            'mysql:database',
            'wordpress:website'
          ]
        },
        RequestId: 1
      };
      assert.deepEqual(expected, last_message);
    });

    it('calls the ecs remove relation', function() {
      var lazy = utils.makeStubMethod(env.get('ecs'), '_lazyRemoveRelation');
      this._cleanups.push(lazy.reset);
      env.remove_relation([], [], function() {});
      assert.equal(lazy.calledOnce(), true);
    });

    it('successfully removes a relation', function() {
      var endpoint_a, endpoint_b;
      endpointA = ['mysql', {name: 'database'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.remove_relation(endpointA, endpointB, function(ev) {
        endpoint_a = ev.endpoint_a;
        endpoint_b = ev.endpoint_b;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Response: {}
      });
      assert.equal(endpoint_a, 'mysql:database');
      assert.equal(endpoint_b, 'wordpress:website');
    });

    it('handles failed attempt to remove a relation', function() {
      var endpoint_a, endpoint_b, err;
      endpointA = ['yoursql', {name: 'database'}];
      endpointB = ['wordpress', {name: 'website'}];
      env.remove_relation(endpointA, endpointB, function(ev) {
        endpoint_a = ev.endpoint_a;
        endpoint_b = ev.endpoint_b;
        err = ev.err;
      }, {immediate: true});
      msg = conn.last_message();
      conn.msg({
        RequestId: msg.RequestId,
        Error: 'service "yoursql" not found'
      });
      assert.equal(endpoint_a, 'yoursql:database');
      assert.equal(endpoint_b, 'wordpress:website');
      assert.equal(err, 'service "yoursql" not found');
    });

    it('calls the ecs remove unit', function() {
      var lazy = utils.makeStubMethod(env.get('ecs'), '_lazyRemoveUnit');
      this._cleanups.push(lazy.reset);
      env.remove_units([], function() {});
      assert.equal(lazy.calledOnce(), true);
    });

    it('sends the correct CharmInfo message', function() {
      env.get_charm('cs:precise/wordpress-10');
      var last_message = conn.last_message();
      var expected = {
        Type: 'Client',
        Version: 1,
        Request: 'CharmInfo',
        Params: {CharmURL: 'cs:precise/wordpress-10'},
        RequestId: 1
      };
      assert.deepEqual(expected, last_message);
    });

    it('successfully retrieves information about a charm', function(done) {
      // Define a response example.
      var response = {
        Config: {
          Options: {
            debug: {
              Default: 'no',
              Description: 'Setting this option to "yes" will ...',
              Title: '',
              Type: 'string'
            },
            engine: {
              Default: 'nginx',
              Description: 'Two web server engines are supported...',
              Title: '',
              Type: 'string'
            }
          }
        },
        Meta: {
          Categories: null,
          Description: 'This will install and setup WordPress...',
          Format: 1,
          Name: 'wordpress',
          OldRevision: 0,
          Peers: {
            loadbalancer: {
              Interface: 'reversenginx',
              Limit: 1,
              Optional: false,
              Scope: 'global'
            }
          },
          Provides: {
            website: {
              Interface: 'http',
              Limit: 0,
              Optional: false,
              Scope: 'global'
            }
          },
          Requires: {
            cache: {
              Interface: 'memcache',
              Limit: 1,
              Optional: false,
              Scope: 'global'
            },
            db: {
              Interface: 'mysql',
              Limit: 1,
              Optional: false,
              Scope: 'global'
            }
          },
          Subordinate: false,
          Summary: 'WordPress is a full featured web blogging tool...'
        },
        Revision: 10,
        URL: 'cs:precise/wordpress-10'
      };
      // Define expected options.
      var options = response.Config.Options;
      var expectedOptions = {
        debug: {
          'default': options.debug.Default,
          description: options.debug.Description,
          type: options.debug.Type,
          title: options.debug.Title
        },
        engine: {
          'default': options.engine.Default,
          description: options.engine.Description,
          type: options.engine.Type,
          title: options.engine.Title
        }
      };
      // Define expected peers.
      var meta = response.Meta;
      var peer = meta.Peers.loadbalancer;
      var expectedPeers = {
        loadbalancer: {
          'interface': peer.Interface,
          limit: peer.Limit,
          optional: peer.Optional,
          scope: peer.Scope
        }
      };
      // Define expected provides.
      var provide = meta.Provides.website;
      var expectedProvides = {
        website: {
          'interface': provide.Interface,
          limit: provide.Limit,
          optional: provide.Optional,
          scope: provide.Scope
        }
      };
      // Define expected requires.
      var require1 = meta.Requires.cache;
      var require2 = meta.Requires.db;
      var expectedRequires = {
        cache: {
          'interface': require1.Interface,
          limit: require1.Limit,
          optional: require1.Optional,
          scope: require1.Scope
        },
        db: {
          'interface': require2.Interface,
          limit: require2.Limit,
          optional: require2.Optional,
          scope: require2.Scope
        }
      };
      env.get_charm('cs:precise/wordpress-10', function(data) {
        var err = data.err,
            result = data.result;
        // Ensure the result is correctly generated.
        assert.isUndefined(err);
        assert.deepEqual({options: expectedOptions}, result.config);
        assert.deepEqual(expectedPeers, result.peers);
        assert.deepEqual(expectedProvides, result.provides);
        assert.deepEqual(expectedRequires, result.requires);
        assert.equal(response.URL, result.url);
        // The result is enriched with additional info returned by juju-core.
        assert.equal(response.Revision, result.revision);
        assert.equal(meta.Description, result.description);
        assert.equal(meta.Format, result.format);
        assert.equal(meta.Name, result.name);
        assert.equal(meta.Subordinate, result.subordinate);
        assert.equal(meta.Summary, result.summary);
        done();
      });
      // Mimic response, assuming CharmInfo to be the first request.
      conn.msg({
        RequestId: 1,
        Response: response
      });
    });

    it('handles failed attempt to retrieve charm info', function(done) {
      env.get_charm('cs:precise/wordpress-10', function(data) {
        var err = data.err,
            result = data.result;
        assert.equal('charm not found', err);
        assert.isUndefined(result);
        done();
      });
      // Mimic response, assuming CharmInfo to be the first request.
      conn.msg({
        RequestId: 1,
        Error: 'charm not found'
      });
    });

    it('updates services charm URL', function(done) {
      var args = {url: 'cs:wily/django-42'};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.url, args.url);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            CharmUrl: args.url,
            ForceCharmUrl: false,
            ForceSeries: false,
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services charm URL (force units)', function(done) {
      var args = {url: 'cs:wily/django-42', forceUnits: true};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.forceUnits, true);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            CharmUrl: args.url,
            ForceCharmUrl: true,
            ForceSeries: false,
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services charm URL (force series)', function(done) {
      var args = {url: 'cs:wily/django-42', forceSeries: true};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.forceSeries, true);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            CharmUrl: args.url,
            ForceCharmUrl: false,
            ForceSeries: true
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services settings', function(done) {
      var args = {settings: {'opt1': 'val1', 'opt2': 42}};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.deepEqual(data.settings, args.settings);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            SettingsStrings: {'opt1': 'val1', 'opt2': '42'}
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services constraints', function(done) {
      var args = {constraints: {'cpu-cores': '4', 'mem': 2000}};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.deepEqual(data.constraints, args.constraints);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            Constraints: {'cpu-cores': 4, 'mem': 2000}
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services minimum number of units', function(done) {
      var args = {minUnits: 2};
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.minUnits, args.minUnits);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            MinUnits: 2
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services (multiple properties)', function(done) {
      var args = {
        url: 'cs:trusty/django-47',
        forceUnits: true,
        forceSeries: true,
        settings: {'opt1': 'val1', 'opt2': true},
        constraints: {'cpu-cores': 8},
        minUnits: 3
      };
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.url, args.url);
        assert.strictEqual(data.forceUnits, true);
        assert.strictEqual(data.forceSeries, true);
        assert.deepEqual(data.settings, args.settings);
        assert.deepEqual(data.constraints, args.constraints);
        assert.strictEqual(data.minUnits, 3);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Service',
          Version: 3,
          Request: 'Update',
          Params: {
            ServiceName: 'django',
            CharmUrl: args.url,
            ForceCharmUrl: true,
            ForceSeries: true,
            SettingsStrings: {'opt1': 'val1', 'opt2': 'true'},
            Constraints: args.constraints,
            MinUnits: 3
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('updates services (legacy API)', function(done) {
      env.set('facades', {});
      var args = {
        url: 'cs:trusty/django-47',
        forceUnits: true,
        settings: {'opt1': 'val1', 'opt2': true},
        constraints: {'cpu-cores': 8},
        minUnits: 3
      };
      env.updateService('django', args, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.url, args.url);
        assert.strictEqual(data.forceUnits, true);
        assert.deepEqual(data.settings, args.settings);
        assert.deepEqual(data.constraints, args.constraints);
        assert.strictEqual(data.minUnits, 3);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'Client',
          Version: 0,
          Request: 'ServiceUpdate',
          Params: {
            ServiceName: 'django',
            CharmUrl: args.url,
            ForceCharmUrl: true,
            SettingsStrings: {'opt1': 'val1', 'opt2': 'true'},
            Constraints: args.constraints,
            MinUnits: 3
          },
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
    });

    it('handles failures while updating services', function(done) {
      env.updateService('django', {url: 'django-47'}, function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.url, 'django-47');
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Error: 'bad wolf'});
    });

    it('provides for a missing Params', function() {
      // If no "Params" are provided in an RPC call an empty one is added.
      var op = {Type: 'Client'};
      env._send_rpc(op);
      assert.deepEqual(op.Params, {});
    });

    it('can watch all changes', function() {
      env._watchAll();
      msg = conn.last_message();
      assert.equal(msg.Type, 'Client');
      assert.equal(msg.Request, 'WatchAll');
    });

    it('can retrieve the next set of environment changes', function() {
      // This is normally set by _watchAll, we'll fake it here.
      env._allWatcherId = 42;
      env._next();
      msg = conn.last_message();
      assert.equal(msg.Type, 'AllWatcher');
      assert.equal(msg.Request, 'Next');
      assert.isTrue('Id' in msg);
      // This response is in fact to the sent _next request.
      assert.equal(msg.Id, env._allWatcherId);
    });

    it('stops the mega-watcher', function() {
      // This is normally set by _watchAll, we'll fake it here.
      env._allWatcherId = 42;
      // Make the request.
      var callback = utils.makeStubFunction();
      env._stopWatching(callback);
      // Mimic response.
      conn.msg({RequestId: 1, Response: {}});
      // The callback has been called.
      assert.strictEqual(callback.calledOnce(), true, 'callback not');
      assert.strictEqual(env._allWatcherId, null);
      // The request has been properly sent.
      assert.deepEqual({
        RequestId: 1,
        Type: 'AllWatcher',
        Version: 0,
        Request: 'Stop',
        Id: 42,
        Params: {}
      }, conn.last_message());
    });

    it('fires "_rpc_response" message after an RPC response', function(done) {
      // We don't want the real response, we just want to be sure the event is
      // fired.
      env.detach('_rpc_response');
      env.on('_rpc_response', function(data) {
        done();
      });
      // Calling this sets up the callback.
      env._next();
      env._txn_callbacks[env._counter].call(env, {});
      // The only test assertion is that done (above) is called.
    });

    it('fires "delta" when handling an RPC response', function(done) {
      env.detach('delta');
      var callbackData = {Response: {Deltas: [['service', 'deploy', {}]]}};
      env.on('delta', function(evt) {
        done();
      });
      env._handleRpcResponse(callbackData);
    });

    it('translates the type of each change in the delta', function(done) {
      env.detach('delta');
      var callbackData = {Response: {Deltas: [['service', 'deploy', {}]]}};
      env.on('delta', function(evt) {
        var change = evt.data.result[0];
        assert.deepEqual(['serviceInfo', 'deploy', {}], change);
        done();
      });
      env._handleRpcResponse(callbackData);
    });

    it('sorts deltas', function(done) {
      env.detach('delta');
      var callbackData = {
        Response: {
          Deltas: [
            ['annotation', 'change', {}],
            ['relation', 'change', {}],
            ['machine', 'change', {}],
            ['remoteservice', 'change', {}],
            ['foobar', 'fake', {}],
            ['unit', 'change', {}],
            ['service', 'deploy', {}]
          ]
        }
      };
      env.on('delta', function(evt) {
        var change = evt.data.result.map(function(delta) {
          return delta[0];
        });
        assert.deepEqual([
          'serviceInfo',
          'relationInfo',
          'unitInfo',
          'machineInfo',
          'annotationInfo',
          'remoteserviceInfo',
          'foobarInfo'
        ], change);
        done();
      });
      env._handleRpcResponse(callbackData);
    });

    it('the _rpc_response subscription can not have args', function() {
      var subscribers = env.getEvent('_rpc_response')._subscribers;
      // This test assumes that there is only one subscriber.  If we ever have
      // any more we will need to update this test.
      assert.equal(subscribers.length, 1);
      assert.equal(subscribers[0].args, null);
    });

    it('can resolve a problem with a unit', function() {
      var unit_name = 'mysql/0';
      env.resolved(unit_name);
      msg = conn.last_message();
      assert.equal(msg.Type, 'Client');
      assert.equal(msg.Request, 'Resolved');
      assert.equal(msg.Params.UnitName, 'mysql/0');
      assert.isFalse(msg.Params.Retry);
    });

    it('can retry a problem with a unit', function() {
      var unit_name = 'mysql/0';
      env.resolved(unit_name, null, true);
      msg = conn.last_message();
      assert.equal(msg.Type, 'Client');
      assert.equal(msg.Request, 'Resolved');
      assert.equal(msg.Params.UnitName, 'mysql/0');
      assert.isTrue(msg.Params.Retry);
    });

    it('can remove a unit', function() {
      var unit_name = 'mysql/0';
      env.remove_units([unit_name], null, {immediate: true});
      msg = conn.last_message();
      assert.equal(msg.Type, 'Service');
      assert.equal(msg.Request, 'DestroyUnits');
      assert.deepEqual(msg.Params.UnitNames, ['mysql/0']);
    });

    it('can provide a callback', function(done) {
      var unit_name = 'mysql/0';
      env.resolved(unit_name, null, true, function(result) {
        assert.equal(result.op, 'resolved');
        assert.equal(result.err, 'badness');
        done();
      });
      msg = conn.last_message();
      env.dispatch_result({
        RequestId: msg.RequestId,
        Error: 'badness',
        Response: {}
      });
    });

    it('provides provider features for all supported providers', function() {
      var providers = [
        'all',
        'azure',
        'demonstration',
        'ec2',
        'joyent',
        'local',
        'maas',
        'openstack',
        'manual'
      ];
      var providerFeatures = Y.juju.environments.providerFeatures;
      providers.forEach(function(provider) {
        assert.equal(
            Y.Lang.isArray(providerFeatures[provider].supportedContainerTypes),
            true);
      });
    });

    it('requests the changes from Juju using a YAML', function() {
      var yaml = 'foo:\n  bar: baz';
      var callback = utils.makeStubFunction();
      env.getBundleChanges(yaml, null, callback);
      msg = conn.last_message();
      assert.deepEqual(msg, {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'GetBundleChanges',
        Params: {YAML: yaml}
      });
    });

    it('requests the changes from the GUI server using a token', function() {
      var callback = utils.makeStubFunction();
      env.getBundleChanges(null, 'TOKEN', callback);
      msg = conn.last_message();
      assert.deepEqual(msg, {
        RequestId: 1,
        Type: 'Client',
        Version: 1,
        Request: 'GetBundleChanges',
        Params: {Token: 'TOKEN'}
      });
    });

    it('handles processing the bundle changes response', function() {
      var yaml = 'foo:\n  bar: baz';
      var callback = utils.makeStubFunction();
      env.getBundleChanges(yaml, null, callback);
      msg = conn.last_message();
      env.dispatch_result({
        RequestId: msg.RequestId,
        Response: {changes: ['foo']}
      });
      assert.equal(callback.callCount(), 1);
      assert.deepEqual(callback.lastArguments()[0], {
        changes: ['foo'],
        errors: undefined
      });
    });

    it('handles bundle changes error response', function() {
      var yaml = 'foo:\n  bar: baz';
      var callback = utils.makeStubFunction();
      env.getBundleChanges(yaml, null, callback);
      msg = conn.last_message();
      env.dispatch_result({
        RequestId: msg.RequestId,
        Response: {errors: ['bad wolf']}
      });
      assert.equal(callback.callCount(), 1);
      assert.deepEqual(callback.lastArguments()[0], {
        changes: undefined,
        errors: ['bad wolf']
      });
    });

    it('handles yaml parsing errors from the GUI server', function() {
      var yaml = 'foo:\n  bar: baz';
      var callback = utils.makeStubFunction();
      env.getBundleChanges(yaml, null, callback);
      msg = conn.last_message();
      env.dispatch_result({
        RequestId: msg.RequestId,
        Error: 'bad wolf'
      });
      assert.equal(callback.callCount(), 1);
      assert.deepEqual(callback.lastArguments()[0], {
        changes: undefined,
        errors: ['bad wolf']
      });
    });

    it('falls back to GUI server for bundle deployments', function(done) {
      var yaml = 'foo:\n  bar: baz';
      env.getBundleChanges(yaml, null, function(data) {
        assert.strictEqual(data.errors, undefined);
        assert.deepEqual(data.changes, ['foo']);
        done();
      });
      // Mimic the first response to Client.GetBundleChanges (Juju).
      conn.msg({
        RequestId: 1,
        ErrorCode: 'not implemented'
      });
      // Mimic the second response to ChangeSet.GetChanges (GUI server).
      conn.msg({
        RequestId: 2,
        Response: {Changes: ['foo']}
      });
    });

    it('handles errors on GUI server bundle deployments', function(done) {
      var yaml = 'foo:\n  bar: baz';
      env.getBundleChanges(yaml, null, function(data) {
        assert.strictEqual(data.changes, undefined);
        assert.deepEqual(data.errors, ['bad wolf']);
        done();
      });
      // Mimic the first response to Client.GetBundleChanges (Juju).
      conn.msg({
        RequestId: 1,
        ErrorCode: 'not implemented'
      });
      // Mimic the second response to ChangeSet.GetChanges (GUI server).
      conn.msg({
        RequestId: 2,
        Response: {Errors: ['bad wolf']}
      });
    });

    it('offers endpoints', function(done) {
      // Define the asynchronous callback.
      var callback = function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.deepEqual(data.endpoints, ['web', 'cache']);
        assert.strictEqual(data.url, 'local:/u/mydjango');
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'CrossModelRelations',
          Version: 1,
          Request: 'Offer',
          Params: {
            Offers: [{
              servicename: 'django',
              endpoints: ['web', 'cache'],
              serviceurl: 'local:/u/mydjango',
              allowedusers: ['user-dalek', 'user-cyberman'],
              servicedescription: 'my description'
            }]
          },
          RequestId: 1
        });
        done();
      };

      // Perform the request.
      env.offer(
        'django', ['web', 'cache'], 'local:/u/mydjango', ['dalek', 'cyberman'],
        'my description', callback);

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Results: [{}]
        }
      });
    });

    it('offers endpoints without users and URL', function(done) {
      // Define the asynchronous callback.
      env.set('environmentName', 'myenv');
      var callback = function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'haproxy');
        assert.deepEqual(data.endpoints, ['proxy']);
        assert.strictEqual(data.url, 'local:/u/user/myenv/haproxy');
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'CrossModelRelations',
          Version: 1,
          Request: 'Offer',
          Params: {
            Offers: [{
              servicename: 'haproxy',
              endpoints: ['proxy'],
              serviceurl: 'local:/u/user/myenv/haproxy',
              allowedusers: ['user-public'],
              servicedescription: ''
            }]
          },
          RequestId: 1
        });
        done();
      };

      // Perform the request.
      env.offer('haproxy', ['proxy'], '', [], '', callback);

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Results: [{}]
        }
      });
    });

    it('handles request failures while offering endpoints', function(done) {
      var callback = function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        assert.strictEqual(data.service, 'django');
        assert.deepEqual(data.endpoints, ['web', 'cache']);
        assert.strictEqual(data.url, 'local:/u/mydjango');
        done();
      };

      // Perform the request.
      env.offer(
        'django', ['web', 'cache'], 'local:/u/mydjango', ['dalek'],
        'my description', callback);

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          Results: [{Error: {
            Message: 'bad wolf'
          }}]
        }
      });
    });

    it('handles API failures while offering endpoints', function(done) {
      var callback = function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        assert.strictEqual(data.service, 'django');
        assert.deepEqual(data.endpoints, ['web', 'cache']);
        assert.strictEqual(data.url, 'local:/u/mydjango');
        done();
      };

      // Perform the request.
      env.offer(
        'django', ['web', 'cache'], 'local:/u/mydjango', ['dalek'],
        'my description', callback);

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'bad wolf'
      });
    });

    it('lists offers', function(done) {
      // Perform the request.
      env.listOffers(null, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.deepEqual(data.results, [
          {
            service: 'mydjango',
            url: 'local:/u/who/my-env/django',
            charm: 'django',
            endpoints: [
              {
                name: 'website',
                interface: 'http',
                role: 'provider'
              }
            ]
          },
          {err: 'bad wolf'},
          {
            service: 'haproxy',
            url: 'local:/u/dalek/ha',
            charm: 'cs:haproxy',
            endpoints: [
              {
                name: 'cache',
                interface: 'http',
                role: 'requirer'
              },
              {
                name: 'webproxy',
                interface: 'proxy',
                role: 'provider'
              }
            ]
          }
        ]);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'CrossModelRelations',
          Version: 1,
          Request: 'ListOffers',
          Params: {
            Filters: [{
              FilterTerms: []
            }]
          },
          RequestId: 1
        });
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            result: [
              {result: {
                servicename: 'mydjango',
                serviceurl: 'local:/u/who/my-env/django',
                charmname: 'django',
                endpoints: [{
                  name: 'website',
                  interface: 'http',
                  role: 'provider',
                  limit: 0,
                  scope: 'global'
                }]
              }},
              {error: 'bad wolf'},
              {result: {
                servicename: 'haproxy',
                serviceurl: 'local:/u/dalek/ha',
                charmname: 'cs:haproxy',
                endpoints: [{
                  name: 'cache',
                  interface: 'http',
                  role: 'requirer',
                  limit: 0,
                  scope: 'global'
                }, {
                  name: 'webproxy',
                  interface: 'proxy',
                  role: 'provider',
                  limit: 1,
                  scope: 'global'
                }]
              }}
            ]
          }]
        }
      });
    });

    it('handles failures while listing offers', function(done) {
      // Perform the request.
      env.listOffers(null, function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        assert.deepEqual(data.results, []);
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'bad wolf'
      });
    });

    it('retrieves details on an offer', function(done) {
      // Perform the request.
      var url = 'local:/u/admin/ec2/django';
      env.getOffer(url, function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.service, 'django');
        assert.strictEqual(data.url, url);
        assert.strictEqual(data.description, 'these are the voyages');
        assert.strictEqual(data.sourceName, 'aws');
        assert.strictEqual(data.sourceId, 'uuid');
        assert.deepEqual(data.endpoints, [
          {name: 'cache', interface: 'http', role: 'requirer'},
          {name: 'webproxy', interface: 'proxy', role: 'provider'}
        ]);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'CrossModelRelations',
          Version: 1,
          Request: 'ServiceOffers',
          Params: {serviceurls: [url]},
          RequestId: 1
        });
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            result: {
              servicename: 'django',
              serviceurl: url,
              servicedescription: 'these are the voyages',
              sourcelabel: 'aws',
              sourceenviron: 'environment-uuid',
              endpoints: [{
                name: 'cache',
                interface: 'http',
                role: 'requirer',
                limit: 0,
                scope: 'global'
              }, {
                name: 'webproxy',
                interface: 'proxy',
                role: 'provider',
                limit: 1,
                scope: 'global'
              }]
            }
          }]
        }
      });
    });

    it('handles request failures while retrieving an offer', function(done) {
      // Perform the request.
      env.getOffer('local:/u/admin/aws/haproxy', function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Error: 'bad wolf'
      });
    });

    it('handles API failures while retrieving an offer', function(done) {
      // Perform the request.
      env.getOffer('local:/u/admin/aws/haproxy', function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        done();
      });

      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          results: [{
            error: {Message: 'bad wolf'}
          }]
        }
      });
    });

    it('successfully creates a local model', function(done) {
      env.set('providerType', 'local');
      env.createModel('myenv', 'user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.name, 'myenv');
        assert.strictEqual(data.owner, 'user-rose');
        assert.strictEqual(data.uuid, 'unique-id');
        assert.equal(conn.messages.length, 3);
        assert.deepEqual(conn.messages[0], {
          Type: 'ModelManager',
          Version: 2,
          Request: 'ConfigSkeleton',
          Params: {},
          RequestId: 1
        });
        assert.deepEqual(conn.messages[1], {
          Type: 'Client',
          Version: 1,
          Request: 'ModelGet',
          Params: {},
          RequestId: 2
        });
        assert.deepEqual(conn.messages[2], {
          Type: 'ModelManager',
          Version: 2,
          Request: 'CreateModel',
          Params: {
            OwnerTag: 'user-who',
            Config: {
              attr1: 'value1',
              attr2: 'value2',
              name: 'myenv',
              namespace: 'who-local',
              'authorized-keys': 'ssh-rsa INVALID'
            }
          },
          RequestId: 3
        });
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'value1', attr2: 'value2'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {namespace: 'who-local'}}
      });
      // Mimic the third response to ModelManager.CreateModel.
      conn.msg({
        RequestId: 3,
        Response: {
          Name: 'myenv',
          OwnerTag: 'user-rose',
          UUID: 'unique-id'
        }
      });
    });

    it('successfully creates a local model (legacy)', function(done) {
      env.set('providerType', 'local');
      env.set('facades', {'EnvironmentManager': [1]});
      env.createModel('myenv', 'user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.name, 'myenv');
        assert.strictEqual(data.owner, 'user-rose');
        assert.strictEqual(data.uuid, 'unique-id');
        assert.equal(conn.messages.length, 3);
        assert.deepEqual(conn.messages[0], {
          Type: 'EnvironmentManager',
          Version: 1,
          Request: 'ConfigSkeleton',
          Params: {},
          RequestId: 1
        });
        assert.deepEqual(conn.messages[1], {
          Type: 'Client',
          Version: 0,
          Request: 'EnvironmentGet',
          Params: {},
          RequestId: 2
        });
        assert.deepEqual(conn.messages[2], {
          Type: 'EnvironmentManager',
          Version: 1,
          Request: 'CreateEnvironment',
          Params: {
            OwnerTag: 'user-who',
            Config: {
              attr1: 'value1',
              attr2: 'value2',
              name: 'myenv',
              namespace: 'who-local',
              'authorized-keys': 'ssh-rsa INVALID'
            }
          },
          RequestId: 3
        });
        done();
      });
      // Mimic the first response to EnvironmentManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'value1', attr2: 'value2'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {namespace: 'who-local'}}
      });
      // Mimic the third response to EnvironmentManager.CreateEnvironment.
      conn.msg({
        RequestId: 3,
        Response: {
          Name: 'myenv',
          OwnerTag: 'user-rose',
          UUID: 'unique-id'
        }
      });
    });

    it('successfully creates an ec2 model', function(done) {
      env.set('providerType', 'ec2');
      env.createModel('myenv', 'user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.name, 'my-ec2-env');
        assert.equal(conn.messages.length, 3);
        assert.deepEqual(conn.messages[2], {
          Type: 'ModelManager',
          Version: 2,
          Request: 'CreateModel',
          Params: {
            OwnerTag: 'user-who',
            Config: {
              attr1: 'value1',
              attr2: 'value2',
              name: 'myenv',
              'authorized-keys': 'ssh-rsa INVALID',
              'access-key': 'access!',
              'secret-key': 'secret!'
            }
          },
          RequestId: 3
        });
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'value1', attr2: 'value2'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {'access-key': 'access!', 'secret-key': 'secret!'}}
      });
      // Mimic the third response to ModelManager.CreateModel.
      conn.msg({
        RequestId: 3,
        Response: {
          Name: 'my-ec2-env',
          OwnerTag: 'user-rose',
          UUID: 'unique-id'
        }
      });
    });

    it('successfully creates an openstack model', function(done) {
      env.set('providerType', 'openstack');
      env.createModel('myenv', 'user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.name, 'my-openstack-env');
        assert.equal(conn.messages.length, 3);
        assert.deepEqual(conn.messages[2], {
          Type: 'ModelManager',
          Version: 2,
          Request: 'CreateModel',
          Params: {
            OwnerTag: 'user-who',
            Config: {
              attr1: 'valueA',
              attr2: 'valueB',
              name: 'myenv',
              'authorized-keys': 'ssh-rsa INVALID',
              'tenant-name': 'tenant',
              username: 'who',
              password: 'secret!'
            }
          },
          RequestId: 3
        });
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'valueA', attr2: 'valueB'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {
          'tenant-name': 'tenant',
          username: 'who',
          password: 'secret!'
        }}
      });
      // Mimic the third response to ModelManager.CreateModel.
      conn.msg({
        RequestId: 3,
        Response: {
          Name: 'my-openstack-env',
          OwnerTag: 'user-rose',
          UUID: 'unique-id'
        }
      });
    });

    it('successfully creates a MAAS model', function(done) {
      env.set('providerType', 'maas');
      env.createModel('myenv', 'user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.strictEqual(data.name, 'my-maas-env');
        assert.equal(conn.messages.length, 3);
        assert.deepEqual(conn.messages[2], {
          Type: 'ModelManager',
          Version: 2,
          Request: 'CreateModel',
          Params: {
            OwnerTag: 'user-who',
            Config: {
              attr1: 'valueA',
              attr2: 'valueB',
              name: 'myenv',
              'authorized-keys': 'ssh-rsa INVALID',
              'maas-server': 'server',
              'maas-oauth': 'oauth',
              'maas-agent-name': 'agent'
            }
          },
          RequestId: 3
        });
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'valueA', attr2: 'valueB'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {
          'maas-server': 'server',
          'maas-oauth': 'oauth',
          'maas-agent-name': 'agent'
        }}
      });
      // Mimic the third response to ModelManager.CreateModel.
      conn.msg({
        RequestId: 3,
        Response: {
          Name: 'my-maas-env',
          OwnerTag: 'user-rose',
          UUID: 'unique-id'
        }
      });
    });

    it('handles failures while retrieving model skeleton', function(done) {
      env.createModel('bad-env', 'user-dalek', function(data) {
        assert.strictEqual(
          data.err, 'cannot get configuration skeleton: bad wolf');
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({RequestId: 1, Error: 'bad wolf'});
    });

    it('handles failures while retrieving model config', function(done) {
      env.createModel('bad-env', 'user-dalek', function(data) {
        assert.strictEqual(
          data.err, 'cannot get model configuration: bad wolf');
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'value1', attr2: 'value2'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({RequestId: 2, Error: 'bad wolf'});
    });

    it('handles failures while creating models', function(done) {
      env.set('providerType', 'local');
      env.createModel('bad-env', 'user-dalek', function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        done();
      });
      // Mimic the first response to ModelManager.ConfigSkeleton.
      conn.msg({
        RequestId: 1,
        Response: {Config: {attr1: 'value1', attr2: 'value2'}}
      });
      // Mimic the second response to Client.ModelGet.
      conn.msg({
        RequestId: 2,
        Response: {Config: {}}
      });
      // Mimic the third response to ModelManager.CreateModel.
      conn.msg({RequestId: 3, Error: 'bad wolf'});
    });

    it('lists models for a specific owner', function(done) {
      env.listModels('user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.deepEqual([
          {
            name: 'env1',
            tag: 'model-unique1',
            owner: 'user-who',
            uuid: 'unique1',
            lastConnection: 'today'
          },
          {
            name: 'env2',
            tag: 'model-unique2',
            owner: 'user-rose',
            uuid: 'unique2',
            lastConnection: 'yesterday'
          }
        ], data.envs);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'ModelManager',
          Version: 2,
          Request: 'ListModels',
          Params: {Tag: 'user-who'},
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          UserModels: [
            {
              Name: 'env1',
              OwnerTag: 'user-who',
              UUID: 'unique1',
              LastConnection: 'today'
            },
            {
              Name: 'env2',
              OwnerTag: 'user-rose',
              UUID: 'unique2',
              LastConnection: 'yesterday'
            }
          ]
        }
      });
    });

    it('lists models for a specific owner (legacy)', function(done) {
      env.set('facades', {'EnvironmentManager': [1]});
      env.listModels('user-who', function(data) {
        assert.strictEqual(data.err, undefined);
        assert.deepEqual([
          {
            name: 'env1',
            tag: 'model-unique1',
            owner: 'user-who',
            uuid: 'unique1',
            lastConnection: 'today'
          },
          {
            name: 'env2',
            tag: 'model-unique2',
            owner: 'user-rose',
            uuid: 'unique2',
            lastConnection: 'yesterday'
          }
        ], data.envs);
        assert.equal(conn.messages.length, 1);
        assert.deepEqual(conn.last_message(), {
          Type: 'EnvironmentManager',
          Version: 1,
          Request: 'ListEnvironments',
          Params: {Tag: 'user-who'},
          RequestId: 1
        });
        done();
      });
      // Mimic response.
      conn.msg({
        RequestId: 1,
        Response: {
          UserEnvironments: [
            {
              Name: 'env1',
              OwnerTag: 'user-who',
              UUID: 'unique1',
              LastConnection: 'today'
            },
            {
              Name: 'env2',
              OwnerTag: 'user-rose',
              UUID: 'unique2',
              LastConnection: 'yesterday'
            }
          ]
        }
      });
    });

    it('handles failures while listing models', function(done) {
      env.listModels('user-dalek', function(data) {
        assert.strictEqual(data.err, 'bad wolf');
        done();
      });
      // Mimic response.
      conn.msg({RequestId: 1, Error: 'bad wolf'});
    });

  });

})();
