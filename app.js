"use strict";

var request = require('request');

var config = {},
    heating_zone_ids = [],
    zone2devices = {},
    schedule = {},
    zones = {},
    devices = {},
    address,
    lastUpdate;

/**
 * init heating schedule
 */
function init() {
    Homey.log("Starting Heating Schedule...");

    // get local address
    Homey.manager('cloud').getLocalAddress(function (err, localAddress) {
        address = localAddress;

        // get / init settings
        config = Homey.manager('settings').get('config');
        if (!config) {
            config = {};
            Homey.manager('settings').set('config', config);
        }

        // init scheduler
        initScheduler();
    });
}

/**
 * init schedule loop
 */
function initScheduler() {
    getConfig(function () {
        setInterval(doSchedule, 1000 * 60);
        doSchedule();
    });
}

/**
 * read all required configs
 * @param callback
 */
function getConfig(callback) {
    // read zones
    api('/manager/zones/zone?recursive=1', function (zonesData) {
        // add zones
        zones = {
            0: zonesData
        };

        api('/manager/devices/device', function (devicesData) {
            devices = devicesData;

            // add heating devices & -zones
            addHeatingDevices();
            addHeatingZones();

            // prepare scheduled devices
            prepareScheduledDevices(zones);

            // save update timestamp
            lastUpdate = new Date().getTime();

            // run schedule every minute
            if (typeof(callback) == 'function') {
                callback();
            }
        });
    });
}

/**
 * run scheduler
 */
function doSchedule() {
    // check for config changes
    var liveConfig = Homey.manager('settings').get('config'),
        time = new Date().getTime(),
        diff = Math.ceil((time - lastUpdate) / 1000);

    Homey.log('Last Update: ' + diff + 's ago');

    if (liveConfig.updated != config.updated || diff > (60 * 10)) {
        Homey.log('Refreshing config...');

        config = liveConfig;
        getConfig(function () {
            doSchedule();
        });

        return false;
    }

    // check schedule and update target temperatures
    var now = new Date(),
        day = getWeekDay(),
        hour = now.getHours(),
        minute = now.getMinutes();

    Homey.log(day + ' - ' + hour + ':' + minute);

    if (schedule.hasOwnProperty(day)) {
        for (var device_id in schedule[day]) {
            var device_hours = schedule[day][device_id];

            // hour lookup
            if (device_hours.hasOwnProperty(hour)) {
                var device_minutes = device_hours[hour];

                // minute lookup
                if (device_minutes.hasOwnProperty(minute)) {
                    // temperature to set
                    var device_temperature = device_minutes[minute];

                    // set temperature
                    if (device_temperature > 0) {
                        Homey.log('Set target temperature of device ' + device_id + ' to ' + device_temperature + '°');
                        updateTemperature(device_id, device_temperature);
                    }
                }
            }
        }
    }
}

/**
 * Helper: check for empty objects
 * @param obj
 * @returns {boolean}
 */
function isEmptyObject(obj) {
    return !Object.keys(obj).length;
}

/**
 * Helper: get day name
 * @returns {string}
 */
function getWeekDay() {
    var weekday = ["su", "mo", "tu", "we", "th", "fr", "sa"];
    return weekday[new Date().getDay()];
}

/**
 * prepare scheduled devices
 * @param zones
 */
function prepareScheduledDevices(zones) {
    for (var zone_id in zones) {
        var zone = zones[zone_id];

        if (config.schedule.hasOwnProperty(zone.id) && zone2devices.hasOwnProperty(zone.id)) {
            var zone_schedule = config.schedule[zone.id];

            if (zone_schedule.enabled) {
                // get settings by day
                for (var day in zone_schedule.plan) {
                    var plan = zone_schedule.plan[day];
                    if (!schedule.hasOwnProperty(day)) {
                        schedule[day] = {};
                    }

                    // set / reset settings by device
                    var devices = zone2devices[zone.id];
                    for (var d = 0; d < devices.length; d++) {
                        var device_id = devices[d];

                        // set / reset settings for device
                        schedule[day][device_id] = {};

                        // get settings by daytime
                        for (var daytime in plan) {
                            var dayplan = plan[daytime];
                            if (dayplan.hasOwnProperty('hour')) {
                                if (!schedule[day].hasOwnProperty(dayplan.hour)) {
                                    schedule[day][device_id][dayplan.hour] = {};
                                }

                                if (!schedule[day][device_id][dayplan.hour].hasOwnProperty(dayplan.minute)) {
                                    schedule[day][device_id][dayplan.hour][dayplan.minute] = 0;
                                }

                                schedule[day][device_id][dayplan.hour][dayplan.minute] = dayplan.temperature;
                            }
                        }
                    }
                }
            }
        }

        if (!isEmptyObject(zone.children)) {
            prepareScheduledDevices(zone.children);
        }

        // cleanup
        for (day in schedule) {
            var devices = schedule[day];
            for (device_id in devices) {
                var device = devices[device_id];
                if (isEmptyObject(device)) {
                    delete schedule[day][device_id];
                }
            }

            if (isEmptyObject(schedule[day])) {
                delete schedule[day];
            }
        }
    }
}

/**
 * add device to zones
 * @param zone_id
 * @param device_id
 * @param parent_id
 */
function addDeviceToZone(zone_id, device_id, parent_id) {
    addToZone(zone_id, device_id);

    // add parent zone too
    addDeviceToParentZones(parent_id, device_id, zones);
}

/**
 * finaly adds device to zone
 * @param zone_id
 * @param device_id
 */
function addToZone(zone_id, device_id) {
    heating_zone_ids.push(zone_id);

    if (!zone2devices.hasOwnProperty(zone_id)) {
        zone2devices[zone_id] = [];
    }

    zone2devices[zone_id].push(device_id);
}

/**
 * adds device to parent zones
 * @param parent_id
 * @param device_id
 * @param parent_zones
 */
function addDeviceToParentZones(parent_id, device_id, parent_zones) {
    if (parent_id) {
        for (var zone_id in parent_zones) {
            var zone = parent_zones[zone_id];

            if (!isEmptyObject(zone.children)) {
                addDeviceToParentZones(parent_id, device_id, zone.children);
            }

            if (zone.id == parent_id) {
                addDeviceToZone(zone.id, device_id, zone.parent);
            }
        }
    }
}

/**
 * lookup for heating devices in zones
 * capability: 'target_temperature'
 */
function addHeatingDevices() {
    for (var device_id in devices) {
        if (devices.hasOwnProperty(device_id)) {
            var device = devices[device_id];

            if (device.capabilities.hasOwnProperty('target_temperature')) {
                addDeviceToZone(device.zone.id, device.id, device.zone.parent);
            }
        }
    }
}

/**
 * add recursive zones with heating devices, only
 */
function addHeatingZones() {
    // mark zones with heating devices
    function getZonesWithHeatingDevice(zones) {
        for (var zone_id in zones) {
            if (zones.hasOwnProperty(zone_id)) {
                var zone = zones[zone_id];

                if (zone.parent && heating_zone_ids.indexOf(zone.id) == -1) {
                    delete zones[zone_id];
                }
                else if (!isEmptyObject(zone.children)) {
                    zones[zone_id].children = getZonesWithHeatingDevice(zone.children);
                }
            }
        }

        return zones;
    }

    // convert & sort zones to array (copy from /manager/zones/js/zones.js)
    function zoneChildrenToArrayRecursive(zone) {
        var children = [];
        for (var zoneId in zone.children) {
            var child = zone.children[zoneId];
            child.children = zoneChildrenToArrayRecursive(child);
            children.push(child);
        }
        children.sort(function (a, b) {
            return a.index > b.index;
        });
        return children;
    }

    zones = getZonesWithHeatingDevice(zones);
    zones[0].children = zoneChildrenToArrayRecursive(zones[0]);
}

/**
 * updates target_temperature of device
 * @param device_id
 * @param target_temperature
 */
function updateTemperature(device_id, temperature) {
    api('/manager/devices/device/' + device_id + '/state', {
        target_temperature: parseInt(temperature)
    }, function (response) {
        Homey.log(response);
    });
}

/**
 * Homey rest api wrapper
 * @param path
 * @param json
 * @param callback
 * @returns {boolean}
 */
function api(path, json, callback) {
    if (!address || !config.token) {
        return false;
    }

    var method = 'GET';
    if (typeof(json) == 'function') {
        callback = json;
        json = null;
    }
    else if (typeof(json) == 'object') {
        method = 'PUT';
    }

    Homey.log('Requesting ' + path);

    try {
        request({
            method: method,
            url: 'http://' + address + '/api' + path,
            auth: {
                'bearer': config.token
            },
            json: json ? json : true,
            timeout: 10000
        }, function (error, response, body) {
            if(typeof(response) != 'undefined') {
                if (typeof(callback) == 'function') {
                    callback(body.result);
                }
            }
        });
    } catch (err) {
        Homey.log(err);
    }
}

module.exports.init = init;
