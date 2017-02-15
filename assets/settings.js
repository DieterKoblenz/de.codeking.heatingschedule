var config = {
        token: '',
        schedule: {},
        updated: null
    },
    zones = {},
    heating_zone_ids = [],
    default_plan = {
        morning: {
            hour: 6,
            minute: 0,
            temperature: -1
        },
        day: {
            hour: 12,
            minute: 0,
            temperature: -1
        },
        evening: {
            hour: 18,
            minute: 0,
            temperature: -1
        },
        night: {
            hour: 23,
            minute: 59,
            temperature: -1
        }
    };

/**
 * when homey is ready, get zones with heating devices
 */
function onHomeyReady() {
    // read config
    Homey.get('config', function (err, data) {
        if (err) return alert(err);
        if (data.hasOwnProperty('token')) {
            config = data;
        }

        // read zones
        api('GET', '/manager/zones/zone?recursive=1', function (err, zonesData) {
            if (err) return alert(err);

            // add zones
            zones = {
                0: zonesData
            };

            // read devices
            api('GET', '/manager/devices/device', function (err, devices) {
                if (err) return alert(err);

                // lookup for heating devices in zones
                $.each(devices, function (device_id, device) {
                    if (device.capabilities.hasOwnProperty('target_temperature')) {
                        heating_zone_ids.push(device.zone.id);

                        if (device.zone.parent) {
                            heating_zone_ids.push(device.zone.parent);
                        }
                    }
                });

                // mark zones with heating devices
                function getZonesWithHeatingDevice(zones) {
                    $.each(zones, function (zone_id, zone) {
                        if (zone.parent && $.inArray(zone.id, heating_zone_ids) == -1) {
                            delete zones[zone_id];
                        }
                        else {
                            zones[zone_id].schedule_enabled = (config.schedule.hasOwnProperty(zone.id) && config.schedule[zone.id].enabled);

                            if (!$.isEmptyObject(zone.children)) {
                                zones[zone_id].children = getZonesWithHeatingDevice(zone.children);
                            }
                        }
                    });

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
                zones[0].schedule_enabled = (config.schedule.hasOwnProperty(zones[0].id) && config.schedule[zones[0].id].enabled);

                // render the zones
                var items_render = $('#zones-list-template').render(zones[0]);
                $('#zones-list').html(items_render);

                // log config
                //console.log(JSON.stringify(config));

                // init schedule
                initSchedule();

                // settings are ready now! :-)
                Homey.ready();
            });
        });
    });
}

/**
 * init scheduler
 */
function initSchedule() {
    // init temperatures
    $('select.temperature').append('<option value="-1">' + __('no change') + '</option>');
    for (var t = 4; t < 29; t++) {
        $('select.temperature').append('<option value="' + t + '">' + t + '°C</option>');
    }

    // init hours
    for (var h = 0; h < 24; h++) {
        var hh = (h < 10) ? '0' + h : h;
        $('select.hour').append('<option value="' + h + '">' + hh + '</option>');
    }

    // init minutes
    for (var m = 0; m < 60; m++) {
        var mm = (m < 10) ? '0' + m : m;
        $('select.minute').append('<option value="' + m + '">' + mm + '</option>');
    }

    // enable / disable schedule
    $('#toggle_schedule').change(function () {
        if ($(this).is(':checked')) {
            $('#zones-list a.enabled').addClass('schedule_enabled');
            $('#schedule').removeClass('disabled');
            $('#schedule select').attr('disabled', false);
        }
        else {
            $('#zones-list a.enabled').removeClass('schedule_enabled');
            $('#schedule').addClass('disabled');
            $('#schedule select').attr('disabled', true);
        }

        if ($(this).data('s')) {
            $(this).data('s', false);
        } else {
            saveConfig();
        }
    });

    // zones tab
    $('#zones-list a').click(function () {
        $('#zones-list a').removeClass('enabled');
        $(this).addClass('enabled');

        var day = $('#schedule ul a.enabled').data('day');
        loadConfig(day);

        return false;
    });

    // week tab
    $('#schedule ul a').click(function () {
        $('#schedule ul a').removeClass('enabled');
        $(this).addClass('enabled');

        var day = $(this).data('day');
        loadConfig(day);

        return false;
    });

    // save settings onchange
    $('#schedule select').change(function () {
        saveConfig();
    });

    // select first zone initially
    $('#zones-list a:first').click();

    // set token
    $('#token').val(config.token);

    // save token
    $('#submit_token').click(function () {
        if ($(this).find('em').length) {
            return false;
        }

        $(this).html('<em class="fa fa-check"></em>');

        window.setTimeout(function () {
            $('#submit_token').html(__('Save'));
        }, 2000);

        var token = $.trim($('#token').val());
        if (token.indexOf('bearer_token=') > -1) {
            token = token.split('bearer_token=')[1];
        }

        $('#token').val(token);
        config.token = token;
        Homey.set('config', config);
    });
}

/**
 * load settings by config & day
 * @param day
 */
function loadConfig(day) {
    setDefaults();

    var zone_id = $('#zones-list a.enabled').data('id');
    if (config.schedule.hasOwnProperty(zone_id)) {
        var settings = config.schedule[zone_id];

        // enable / disable plan
        $('#toggle_schedule').prop('checked', settings.enabled).data('s', true).change();

        // update individual day settings
        var plan = settings.plan.hasOwnProperty(day) ? settings.plan[day] : default_plan;

        $.each(plan, function (daytime, times) {
            var element = $('#' + daytime);

            if (element.length) {
                $.each(times, function (key, setting) {
                    element.find('select.' + key).val(setting);
                });
            }
        });
    }
}

/**
 * save config to homey
 */
function saveConfig() {
    var zone_id = $('#zones-list a.enabled').data('id'),
        settings = {
            enabled: $('#toggle_schedule').is(':checked'),
            plan: {}
        },
        plans = config.schedule.hasOwnProperty(zone_id) ? config.schedule[zone_id].plan : default_plan,
        daytimes = {};

    $('#plan tbody tr').each(function () {
        var daytime = $(this).attr('id');
        daytimes[daytime] = {};
    });

    $('#days a').each(function () {
        var day = $(this).data('day');

        settings.plan[day] = plans.hasOwnProperty(day) && !$.isEmptyObject(plans[day]) ? plans[day] : default_plan;

        if ($(this).hasClass('enabled')) {
            var plan = {};

            $('#plan tbody tr').each(function () {
                var daytime = $(this).attr('id');
                plan[daytime] = {};

                $(this).find('select').each(function () {
                    var element = $(this).attr('class');
                    plan[daytime][element] = $(this).val();
                });
            });

            settings.plan[day] = plan;
        }
    });

    config.schedule[zone_id] = settings;
    config.updated = new Date().getTime();

    Homey.set('config', config);
}

/**
 * set default data
 */
function setDefaults() {
    $('#toggle_schedule').attr('checked', false);
    $('#schedule').addClass('disabled');
    $('#schedule select').attr('disabled', true);

    $('#morning').find('select.hour').val(6);
    $('#morning').find('select.temperature').val(22);

    $('#day').find('select.hour').val(12);
    $('#day').find('select.temperature').val(18);

    $('#evening').find('select.hour').val(18);
    $('#evening').find('select.temperature').val(22);

    $('#night').find('select.hour').val(0);
    $('#night').find('select.temperature').val(18);
}

/**
 * DEV Mode Options
 */
if (document.location.href.indexOf('127.0.0.1') > -1) {
    $(document).ready(function () {
        function __(str) {
            return str;
        }

        initSchedule();
    });

    heating_zone_ids.push('9919ee1e-ffbc-480b-bc4b-77fb047e9e68');
    heating_zone_ids.push('1815c884-af06-4d53-a2c1-6f4c77e9eb4e');

    function __(str) {
        return str;
    }
}