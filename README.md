# Heating Schedule for Homey
This app let you control your thermostats and schedule several timings for your zones.<br />
After installation, it shows your zones with attached thermostats.<br />
<br />
For each zone you can enable the heating schedule. If one zone isn't enabled, it automatically inherits the schedule from the parent zone (if enabled).
<br />
<br />
If you like this app:

<a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=BZGYJY5M8KZ7N" target="_blank"><img src="https://www.paypal.com/en_US/i/btn/btn_donate_LG.gif" border="0" /></a>

## Cards
**Trigger**
* when a schedule updated thermostats, the condition will be triggered with a device token which contains thermostat name and the updated temperature

**Action**
* enable / disable the heating schedule (e.g. for holidays, no members at home)

## ToDo
* action card: zones: update all thermostats within a zone (e.g. for leaving / coming home)
* action card: zones: trigger latest schedule for a zone (e.g. for coming home)
* condition card: low battery

## Changelog
* 0.0.1 - initial beta release, tested with Danfoss LC13 only (but should work with any other thermostate)!

## Screenshots
![alt text](https://raw.githubusercontent.com/CodeKingLabs/de.codeking.heatingschedule/master/assets/examples/settings.jpg "Settings")

![alt text](https://raw.githubusercontent.com/CodeKingLabs/de.codeking.heatingschedule/master/assets/examples/flow1.jpg "Flow 1")

![alt text](https://raw.githubusercontent.com/CodeKingLabs/de.codeking.heatingschedule/master/assets/examples/flow2.jpg "Flow 2")