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

describe('MachineViewHeader', function() {
  let acl;

  beforeAll(function(done) {
    // By loading this file it adds the component to the juju components.
    YUI().use('machine-view-header', function() { done(); });
  });

  beforeEach(() => {
    acl = shapeup.deepFreeze({isReadOnly: () => false});
  });

  it('can render', function() {
    // The component is wrapped to handle drag and drop, but we just want to
    // test the internal component so we access it via DecoratedComponent.
    const output = jsTestUtils.shallowRender(
      <juju.components.MachineViewHeader.DecoratedComponent
        acl={acl}
        canDrop={false}
        connectDropTarget={jsTestUtils.connectDropTarget}
        droppable={true}
        isOver={false}
        title="Sandbox"
        type="machine" />);
    const expected = (
      <div className="machine-view__header">
          Sandbox
        {undefined}
        <div className="machine-view__header-drop-target">
          <div className="machine-view__header-drop-message">
              Create new {'machine'}
          </div>
        </div>
      </div>);
    assert.deepEqual(output, expected);
  });

  it('can render in droppable mode', function() {
    const output = jsTestUtils.shallowRender(
      <juju.components.MachineViewHeader.DecoratedComponent
        acl={acl}
        canDrop={false}
        connectDropTarget={jsTestUtils.connectDropTarget}
        droppable={true}
        isOver={true}
        title="Sandbox"
        type="machine" />);
    const expected = (
      <div className="machine-view__header machine-view__header--drop">
        {output.props.children}
      </div>);
    assert.deepEqual(output, expected);
  });

  it('can render in drop mode', function() {
    const output = jsTestUtils.shallowRender(
      <juju.components.MachineViewHeader.DecoratedComponent
        acl={acl}
        canDrop={true}
        connectDropTarget={jsTestUtils.connectDropTarget}
        droppable={true}
        isOver={false}
        title="Sandbox"
        type="machine" />);
    const expected = (
      <div className="machine-view__header machine-view__header--droppable">
        {output.props.children}
      </div>);
    assert.deepEqual(output, expected);
  });

  it('can render with a menu', function() {
    const menuItems = [];
    const output = jsTestUtils.shallowRender(
      <juju.components.MachineViewHeader.DecoratedComponent
        acl={acl}
        activeMenuItem="name"
        canDrop={false}
        connectDropTarget={jsTestUtils.connectDropTarget}
        droppable={true}
        isOver={false}
        menuItems={menuItems}
        title="Sandbox"
        type="machine" />);
    const expected = (
      <div className="machine-view__header">
          Sandbox
        <juju.components.MoreMenu
          activeItem="name"
          items={menuItems} />
        <div className="machine-view__header-drop-target">
          <div className="machine-view__header-drop-message">
              Create new {'machine'}
          </div>
        </div>
      </div>);
    assert.deepEqual(output, expected);
  });

  it('can render with a toggle', function() {
    const action = sinon.stub();
    const output = jsTestUtils.shallowRender(
      <juju.components.MachineViewHeader.DecoratedComponent
        acl={acl}
        canDrop={false}
        connectDropTarget={jsTestUtils.connectDropTarget}
        droppable={true}
        isOver={false}
        toggle={{
          action: action,
          disabled: false,
          toggleOn: true
        }}
        title="Sandbox"
        type="machine" />);
    const expected = (
      <div className="machine-view__header">
          Sandbox
        <juju.components.GenericButton
          action={action}
          disabled={false}
          type="inline-positive">
          <juju.components.SvgIcon
            name="close_16_white"
            size="16" />
        </juju.components.GenericButton>
        <div className="machine-view__header-drop-target">
          <div className="machine-view__header-drop-message">
              Create new {'machine'}
          </div>
        </div>
      </div>);
    assert.deepEqual(output, expected);
  });
});
