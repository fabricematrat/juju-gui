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

class NotificationListItem extends React.Component {
  constructor() {
    super();
    this.state = {
      visible: true
    };
  }

  /**
    Generates the container classes based on the message type and visisible
    state.

    @method _generateClasses
  */
  _generateClasses() {
    var type = this.props.type || 'info';
    var visible = this.state.visible;
    return classNames(
      'notification-list-item',
      'notification-list-item--' + type,
      {
        'notification-list-item--visible': visible,
        'notification-list-item--hidden': !visible
      });
  }

  /**
    Hides this component and remove it from its parent. The parent will
    auto remove non error components after a duration.

    @method hide
  */
  hide() {
    this.setState({visible: false});
    setTimeout(() => {
      // Wait before telling the parent to clean up so that the animation
      // has time to complete. Note that the default timeout is closely tied
      // to animation timings set in the notification CSS, so don't change one
      // without changing the other.
      this.props.removeNotification(this.props.timestamp);
    }, this.props.timeout || 750);
  }

  render() {
    return (
      <li className={this._generateClasses()}>
        <span>{this.props.message}</span>
        <span tabIndex="0" role="button"
          className="notification-list-item__hide"
          onClick={this.hide.bind(this)}>
          <juju.components.SvgIcon name="close_16"
            size="16" />
        </span>
      </li>);
  }
};

NotificationListItem.propTypes = {
  message: PropTypes.string.isRequired,
  removeNotification: PropTypes.func.isRequired,
  timeout: PropTypes.number,
  timestamp: PropTypes.string.isRequired,
  type: PropTypes.string
};

YUI.add('notification-list-item', function() {
  juju.components.NotificationListItem = NotificationListItem;
}, '0.1.0', {
  requires: [
    'svg-icon'
  ]
});
