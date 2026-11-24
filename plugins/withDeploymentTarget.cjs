// Raise every Pod target's deployment target to the app's minimum.
// react-native-svg still ships 12.4 for RNSVGFilters, which Xcode 27 rejects
// ("supported deployment target versions is 15.0 to 27.1.x").
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'post_install do |installer|';
const SNIPPET = `
    # solshot-deployment-floor
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        floor = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4' if floor < 16.4
      end
    end
`;

module.exports = function withDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfile, 'utf8');
      if (!src.includes('solshot-deployment-floor') && src.includes(MARKER)) {
        src = src.replace(MARKER, MARKER + SNIPPET);
        fs.writeFileSync(podfile, src);
      }
      return cfg;
    },
  ]);
};
