/*
This file is part of the Juju GUI, which lets users view and manage Juju
environments within a graphical interface (https://launchpad.net/juju-gui).
Copyright (C) 2016 Canonical Ltd.

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

class DeploymentCloud extends React.Component {
  constructor() {
    super();
    this.state = {
      clouds: [],
      cloudsLoading: true
    };
  }

  componentWillMount() {
    const listClouds = () => {
      // It is possible that the controller hasn't yet connected so
      // bounce until it's connected then fetch the clouds list.
      if (!this.props.controllerIsReady()) {
        setTimeout(listClouds, 500);
        return;
      }
      this.props.listClouds((error, clouds) => {
        if (error) {
          const message = 'unable to list clouds';
          this.props.addNotification({
            title: message,
            message: `${message}: ${error}`,
            level: 'error'
          });
          console.error(message, error);
          return;
        }
        let cloudList = [];
        if (clouds) {
          cloudList = Object.keys(clouds).map(name => {
            const cloud = clouds[name];
            cloud.name = name;
            return cloud;
          });
        }
        this.setState({
          clouds: cloudList,
          cloudsLoading: false
        });
        // If there is only one cloud then automatically select it.
        if (cloudList.length === 1) {
          this.props.setCloud(cloudList[0]);
        }
      });
    };
    listClouds();
  }

  /**
    Generate the list of clouds.

    @method _generateClouds
    @returns {Object} The cloud list.
  */
  _generateClouds() {
    if (this.state.cloudsLoading) {
      return (
        <div className="deployment-cloud__loading">
          <juju.components.Spinner />
        </div>);
    }
    if (this.props.cloud) {
      return;
    }
    var clouds = [];
    this.state.clouds.forEach((cloud, i) => {
      var classes = classNames(
        'deployment-cloud__cloud',
        'four-col',
        {'last-col': i % 3 === 2});
      clouds.push(
        <li className={classes}
          key={cloud.name}
          onClick={this.props.setCloud.bind(null, cloud)}
          role="button"
          tabIndex="0">
          <span className="deployment-cloud__cloud-logo">
            {this._generateLogo(cloud)}
          </span>
        </li>);
    });
    return (
      <ul className="deployment-cloud__list">
        {clouds}
      </ul>);
  }

  /**
    Generate the logo for the selected cloud.

    @method _generateCloud
    @returns {Object} The cloud.
  */
  _generateCloud() {
    var cloud = this.props.cloud;
    if (!cloud) {
      return;
    }
    return (
      <div className="deployment-cloud__chosen">
        {this._generateLogo(cloud)}
      </div>);
  }

  /**
    Generate the logo for a cloud;

    @method _generateLogo
    @param {Object} cloud A cloud.
    @returns {Array} The logo.
  */
  _generateLogo(cloud) {
    const info = this.props.getCloudProviderDetails(cloud.cloudType);
    if (!info) {
      return cloud.name;
    }
    return info.showLogo ? (
      <juju.components.SvgIcon
        height={info.svgHeight}
        name={info.id}
        width={info.svgWidth} />) : info.title;
  }

  render() {
    return (
      <div>
        {this._generateClouds()}
        {this._generateCloud()}
      </div>
    );
  }
};

DeploymentCloud.propTypes = {
  acl: PropTypes.object.isRequired,
  addNotification: PropTypes.func.isRequired,
  cloud: PropTypes.object,
  controllerIsReady: PropTypes.func.isRequired,
  getCloudProviderDetails: PropTypes.func.isRequired,
  listClouds: PropTypes.func.isRequired,
  setCloud: PropTypes.func.isRequired
};

YUI.add('deployment-cloud', function() {
  juju.components.DeploymentCloud = DeploymentCloud;
}, '0.1.0', {
  requires: [
    'loading-spinner',
    'svg-icon'
  ]
});
