/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2015 Canonical Ltd.

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

var juju = {components: {}}; // eslint-disable-line no-unused-vars

chai.config.includeStack = true;
chai.config.truncateThreshold = 0;

describe('EntityDetails', function() {
  var acl, mockEntity, urllib;

  beforeAll(function(done) {
    // By loading these files it makes their classes available in the tests.
    YUI().use('entity-details', 'jujulib-utils', function() { done(); });
  });

  beforeEach(function() {
    acl = {isReadOnly: sinon.stub().returns(false)};
    mockEntity = jsTestUtils.makeEntity();
    urllib = sinon.stub();
  });

  afterEach(function() {
    mockEntity = undefined;
  });

  it('fetches an entity properly', function() {
    mockEntity.hasMetrics = sinon.stub().returns(false);
    const apiUrl = 'http://example.com';
    const id = mockEntity.get('id');
    const getEntity = sinon.stub().callsArgWith(1, null, [mockEntity]);
    const makeEntityModel = sinon.stub().returns(mockEntity);
    const deployService = sinon.spy();
    const changeState = sinon.spy();
    const importBundleYAML = sinon.spy();
    const getBundleYAML = sinon.spy();
    const getModelName = sinon.spy();
    const pluralize = sinon.spy();
    const getFile = sinon.spy();
    const renderMarkdown = sinon.spy();
    const addNotification = sinon.spy();
    const showTerms = sinon.stub();
    const scrollCharmbrowser = sinon.stub();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        apiUrl={apiUrl}
        changeState={changeState}
        deployService={deployService}
        importBundleYAML={importBundleYAML}
        flags={{ddeploy: true}}
        getBundleYAML={getBundleYAML}
        getDiagramURL={sinon.stub()}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={getModelName}
        hash="readme"
        listPlansForCharm={sinon.stub()}
        scrollPosition={100}
        renderMarkdown={renderMarkdown}
        id={id}
        pluralize={pluralize}
        addNotification={addNotification}
        makeEntityModel={makeEntityModel}
        scrollCharmbrowser={scrollCharmbrowser}
        setPageTitle={sinon.stub()}
        showTerms={showTerms}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    const output = shallowRenderer.getRenderOutput();
    assert.isTrue(getEntity.calledOnce,
      'getEntity function not called');
    assert.equal(getEntity.args[0][0], id,
      'getEntity not called with the entity ID');
    const expectedOutput = (
      <div className="entity-details charm"
        ref="content"
        tabIndex="0">
        <div>
          <juju.components.EntityHeader
            acl={acl}
            entityModel={mockEntity}
            importBundleYAML={importBundleYAML}
            getBundleYAML={getBundleYAML}
            getModelName={getModelName}
            hasPlans={false}
            changeState={changeState}
            addNotification={addNotification}
            deployService={deployService}
            plans={null}
            pluralize={pluralize}
            scrollPosition={100}
            urllib={urllib}
          />
          {undefined}
          <juju.components.EntityContent
            addNotification={addNotification}
            apiUrl={apiUrl}
            changeState={changeState}
            entityModel={mockEntity}
            flags={{ddeploy: true}}
            getFile={getFile}
            hasPlans={false}
            hash="readme"
            plans={null}
            pluralize={pluralize}
            renderMarkdown={renderMarkdown}
            scrollCharmbrowser={scrollCharmbrowser}
            showTerms={showTerms}
          />
        </div>
      </div>
    );
    expect(output).toEqualJSX(expectedOutput);
  });

  it('can display a message if there is a loading error', function() {
    const id = mockEntity.get('id');
    const getEntity = sinon.stub().callsArgWith(1, 'bad wolf', [mockEntity]);
    const deployService = sinon.spy();
    const changeState = sinon.spy();
    const importBundleYAML = sinon.spy();
    const getBundleYAML = sinon.spy();
    const pluralize = sinon.spy();
    const getFile = sinon.spy();
    const renderMarkdown = sinon.spy();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        addNotification={sinon.stub()}
        apiUrl="http://example.com/"
        changeState={changeState}
        deployService={deployService}
        importBundleYAML={importBundleYAML}
        flags={{}}
        getBundleYAML={getBundleYAML}
        getDiagramURL={sinon.stub()}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={sinon.stub()}
        listPlansForCharm={sinon.spy()}
        makeEntityModel={sinon.spy()}
        renderMarkdown={renderMarkdown}
        id={id}
        pluralize={pluralize}
        scrollCharmbrowser={sinon.stub()}
        scrollPosition={0}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    const output = shallowRenderer.getRenderOutput();
    const expectedOutput = (
      <div className="entity-details"
        ref="content"
        tabIndex="0">
        <p className="error">
          There was a problem while loading the entity details.
          You could try searching for another charm or bundle or go{' '}
          <span className="link"
            onClick={instance._handleBack}>
            back
          </span>.
        </p>
      </div>);
    expect(output).toEqualJSX(expectedOutput);
  });

  it('can display a bundle diagram', function() {
    const apiUrl = 'http://example.com';
    const mockEntity = jsTestUtils.makeEntity(true);
    const id = mockEntity.get('id');
    const getEntity = sinon.stub().callsArgWith(1, null, [mockEntity]);
    const makeEntityModel = sinon.stub().returns(mockEntity);
    const deployService = sinon.spy();
    const changeState = sinon.spy();
    const importBundleYAML = sinon.spy();
    const getBundleYAML = sinon.spy();
    const getModelName = sinon.spy();
    const pluralize = sinon.spy();
    const getFile = sinon.spy();
    const renderMarkdown = sinon.spy();
    const getDiagramURL = sinon.spy();
    const addNotification = sinon.spy();
    const showTerms = sinon.stub();
    const scrollCharmbrowser = sinon.stub();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        apiUrl={apiUrl}
        changeState={changeState}
        deployService={deployService}
        importBundleYAML={importBundleYAML}
        flags={{ddeploy: true}}
        getBundleYAML={getBundleYAML}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={getModelName}
        scrollPosition={100}
        renderMarkdown={renderMarkdown}
        getDiagramURL={getDiagramURL}
        hash="readme"
        listPlansForCharm={sinon.stub()}
        id={id}
        pluralize={pluralize}
        addNotification={addNotification}
        makeEntityModel={makeEntityModel}
        scrollCharmbrowser={scrollCharmbrowser}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    const output = shallowRenderer.getRenderOutput();
    assert.isTrue(getEntity.calledOnce,
      'getEntity function not called');
    assert.equal(getEntity.args[0][0], id,
      'getEntity not called with the entity ID');
    const expectedOutput = (
      <div className={'entity-details bundle'}
        ref="content"
        tabIndex="0">
        <div>
          <juju.components.EntityHeader
            acl={acl}
            entityModel={mockEntity}
            importBundleYAML={importBundleYAML}
            getBundleYAML={getBundleYAML}
            getModelName={getModelName}
            hasPlans={false}
            changeState={changeState}
            deployService={deployService}
            addNotification={addNotification}
            plans={null}
            pluralize={pluralize}
            scrollPosition={100}
            urllib={urllib}
          />
          <juju.components.EntityContentDiagram
            getDiagramURL={getDiagramURL}
            id={id}
            isRow={true}
          />
          <juju.components.EntityContent
            addNotification={addNotification}
            apiUrl={apiUrl}
            changeState={changeState}
            entityModel={mockEntity}
            flags={{ddeploy: true}}
            getFile={getFile}
            hasPlans={false}
            hash="readme"
            plans={null}
            pluralize={pluralize}
            renderMarkdown={renderMarkdown}
            scrollCharmbrowser={scrollCharmbrowser}
            showTerms={showTerms}
          />
        </div>
      </div>);
    expect(output).toEqualJSX(expectedOutput);
  });

  it('will abort the request when unmounting', function() {
    const abort = sinon.stub();
    const id = mockEntity.get('id');
    const getEntity = sinon.stub().returns({abort: abort});
    const deployService = sinon.spy();
    const changeState = sinon.spy();
    const importBundleYAML = sinon.spy();
    const getBundleYAML = sinon.spy();
    const pluralize = sinon.spy();
    const getFile = sinon.spy();
    const renderMarkdown = sinon.spy();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        addNotification={sinon.stub()}
        apiUrl="http://example.com/"
        changeState={changeState}
        deployService={deployService}
        importBundleYAML={importBundleYAML}
        flags={{}}
        getBundleYAML={getBundleYAML}
        getDiagramURL={sinon.stub()}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={sinon.stub()}
        listPlansForCharm={sinon.stub()}
        makeEntityModel={sinon.spy()}
        renderMarkdown={renderMarkdown}
        id={id}
        pluralize={pluralize}
        scrollCharmbrowser={sinon.stub()}
        scrollPosition={0}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    instance.componentWillUnmount();
    assert.equal(abort.callCount, 1);
  });

  it('sets the focus when rendered', function() {
    const focus = sinon.stub();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        addNotification={sinon.stub()}
        apiUrl="http://example.com/"
        id="test"
        changeState={sinon.spy()}
        deployService={sinon.spy()}
        flags={{}}
        getBundleYAML={sinon.stub()}
        getDiagramURL={sinon.stub()}
        getEntity={sinon.spy()}
        getFile={sinon.stub()}
        getModelName={sinon.stub()}
        importBundleYAML={sinon.stub()}
        listPlansForCharm={sinon.stub()}
        makeEntityModel={sinon.spy()}
        pluralize={sinon.spy()}
        renderMarkdown={sinon.stub()}
        scrollCharmbrowser={sinon.stub()}
        scrollPosition={0}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: focus}};
    instance.componentDidMount();
    assert.equal(focus.callCount, 1);
  });

  it('can get plans', function() {
    mockEntity.hasMetrics = sinon.stub().returns(true);
    const plans = ['plan1', 'plan2'];
    const addNotification = sinon.spy();
    const apiUrl = 'http://example.com';
    const changeState = sinon.spy();
    const deployService = sinon.spy();
    const getBundleYAML = sinon.spy();
    const getEntity = sinon.stub().callsArgWith(1, null, [mockEntity]);
    const getFile = sinon.spy();
    const getModelName = sinon.spy();
    const id = mockEntity.get('id');
    const importBundleYAML = sinon.spy();
    const listPlansForCharm = sinon.stub().callsArgWith(1, null, plans);
    const makeEntityModel = sinon.stub().returns(mockEntity);
    const pluralize = sinon.spy();
    const renderMarkdown = sinon.spy();
    const showTerms = sinon.stub();
    const scrollCharmbrowser = sinon.stub();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        addNotification={addNotification}
        apiUrl={apiUrl}
        changeState={changeState}
        deployService={deployService}
        flags={{ddeploy: true}}
        getBundleYAML={getBundleYAML}
        getDiagramURL={sinon.stub()}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={getModelName}
        hash="readme"
        id={id}
        importBundleYAML={importBundleYAML}
        listPlansForCharm={listPlansForCharm}
        makeEntityModel={makeEntityModel}
        pluralize={pluralize}
        renderMarkdown={renderMarkdown}
        scrollCharmbrowser={scrollCharmbrowser}
        scrollPosition={100}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    const output = shallowRenderer.getRenderOutput();
    assert.isTrue(getEntity.calledOnce,
      'getEntity function not called');
    assert.equal(getEntity.args[0][0], id,
      'getEntity not called with the entity ID');
    const expectedOutput = (
      <div className={'entity-details charm'}
        ref="content"
        tabIndex="0">
        <div>
          <juju.components.EntityHeader
            acl={acl}
            entityModel={mockEntity}
            importBundleYAML={importBundleYAML}
            getBundleYAML={getBundleYAML}
            getModelName={getModelName}
            hasPlans={true}
            changeState={changeState}
            addNotification={addNotification}
            deployService={deployService}
            plans={plans}
            pluralize={pluralize}
            scrollPosition={100}
            urllib={urllib}
          />
          {undefined}
          <juju.components.EntityContent
            addNotification={addNotification}
            apiUrl={apiUrl}
            changeState={changeState}
            entityModel={mockEntity}
            flags={{ddeploy: true}}
            getFile={getFile}
            hasPlans={true}
            hash="readme"
            plans={plans}
            pluralize={pluralize}
            renderMarkdown={renderMarkdown}
            scrollCharmbrowser={scrollCharmbrowser}
            showTerms={showTerms}
          />
        </div>
      </div>);
    expect(output).toEqualJSX(expectedOutput);
    assert.equal(listPlansForCharm.callCount, 1);
    assert.equal(listPlansForCharm.args[0][0], 'cs:django');
  });

  it('can set plans to empty on error', function() {
    mockEntity.hasMetrics = sinon.stub().returns(true);
    const addNotification = sinon.spy();
    const apiUrl = 'http://example.com';
    const changeState = sinon.spy();
    const deployService = sinon.spy();
    const getBundleYAML = sinon.spy();
    const getEntity = sinon.stub().callsArgWith(1, null, [mockEntity]);
    const getFile = sinon.spy();
    const getModelName = sinon.spy();
    const id = mockEntity.get('id');
    const importBundleYAML = sinon.spy();
    const listPlansForCharm = sinon.stub().callsArgWith(1, 'An error', null);
    const makeEntityModel = sinon.stub().returns(mockEntity);
    const pluralize = sinon.spy();
    const renderMarkdown = sinon.spy();
    const showTerms = sinon.stub();
    const scrollCharmbrowser = sinon.stub();
    const shallowRenderer = jsTestUtils.shallowRender(
      <juju.components.EntityDetails
        acl={acl}
        addNotification={addNotification}
        apiUrl={apiUrl}
        changeState={changeState}
        deployService={deployService}
        flags={{ddeploy: true}}
        getBundleYAML={getBundleYAML}
        getDiagramURL={sinon.stub()}
        getEntity={getEntity}
        getFile={getFile}
        getModelName={getModelName}
        hash="readme"
        id={id}
        importBundleYAML={importBundleYAML}
        listPlansForCharm={listPlansForCharm}
        makeEntityModel={makeEntityModel}
        pluralize={pluralize}
        renderMarkdown={renderMarkdown}
        scrollCharmbrowser={scrollCharmbrowser}
        scrollPosition={100}
        setPageTitle={sinon.stub()}
        showTerms={sinon.stub()}
        staticURL="http://example.com"
        urllib={urllib}
      />, true);
    const instance = shallowRenderer.getMountedInstance();
    instance.refs = {content: {focus: sinon.stub()}};
    instance.componentDidMount();
    const output = shallowRenderer.getRenderOutput();
    assert.isTrue(getEntity.calledOnce,
      'getEntity function not called');
    assert.equal(getEntity.args[0][0], id,
      'getEntity not called with the entity ID');
    const expectedOutput = (
      <div className={'entity-details charm'}
        ref="content"
        tabIndex="0">
        <div>
          <juju.components.EntityHeader
            acl={acl}
            entityModel={mockEntity}
            importBundleYAML={importBundleYAML}
            getBundleYAML={getBundleYAML}
            getModelName={getModelName}
            hasPlans={true}
            changeState={changeState}
            addNotification={addNotification}
            deployService={deployService}
            plans={[]}
            pluralize={pluralize}
            scrollPosition={100}
            urllib={urllib}
          />
          {undefined}
          <juju.components.EntityContent
            addNotification={addNotification}
            apiUrl={apiUrl}
            changeState={changeState}
            entityModel={mockEntity}
            flags={{ddeploy: true}}
            getFile={getFile}
            hasPlans={true}
            hash="readme"
            plans={[]}
            pluralize={pluralize}
            renderMarkdown={renderMarkdown}
            scrollCharmbrowser={scrollCharmbrowser}
            showTerms={showTerms}
          />
        </div>
      </div>);
    expect(output).toEqualJSX(expectedOutput);
    assert.equal(listPlansForCharm.callCount, 1);
  });
});
