const {
  createRunOncePlugin,
  IOSConfig,
  withDangerousMod,
  withXcodeProject,
} = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const TARGET_NAME = 'ShadowChatNotificationService';
const BUNDLE_IDENTIFIER = 'com.shadowchat.mobile.notification-service';
const TEMPLATE_DIRECTORY = 'notification-service-extension';

const withShadowChatNotificationServiceExtension = config => {
  config = withDangerousMod(config, [
    'ios',
    async dangerousConfig => {
      const platformRoot = path.resolve(
        dangerousConfig.modRequest.platformProjectRoot
      );
      const destination = path.resolve(platformRoot, TARGET_NAME);
      if (path.dirname(destination) !== platformRoot) {
        throw new Error('Unsafe notification service extension destination.');
      }
      const source = path.resolve(
        dangerousConfig.modRequest.projectRoot,
        'plugins',
        TEMPLATE_DIRECTORY
      );
      fs.rmSync(destination, { recursive: true, force: true });
      fs.cpSync(source, destination, { recursive: true });
      return dangerousConfig;
    },
  ]);

  return withXcodeProject(config, xcodeConfig => {
    const project = xcodeConfig.modResults;
    const existingTarget = IOSConfig.Target.getNativeTargets(project).find(
      ([, target]) =>
        IOSConfig.XcodeUtils.unquote(target.name) === TARGET_NAME
    );
    if (existingTarget) return xcodeConfig;

    const addedTarget = project.addTarget(
      TARGET_NAME,
      'app_extension',
      TARGET_NAME,
      BUNDLE_IDENTIFIER
    );
    const targetId = addedTarget.uuid;
    project.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetId);
    project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', targetId);
    project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', targetId);
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, TARGET_NAME);
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: `${TARGET_NAME}/NotificationService.swift`,
      groupName: TARGET_NAME,
      project,
      targetUuid: targetId,
    });

    const extensionConfigurations =
      IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        project,
        addedTarget.pbxNativeTarget.buildConfigurationList
      );
    const mainTarget = IOSConfig.XcodeUtils.getApplicationNativeTarget({
      project,
      projectName: xcodeConfig.modRequest.projectName,
    });
    const mainConfigurations = new Map(
      IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
        project,
        mainTarget.target.buildConfigurationList
      ).map(([, buildConfig]) => [
        IOSConfig.XcodeUtils.unquote(buildConfig.name),
        buildConfig,
      ])
    );

    for (const [, buildConfig] of extensionConfigurations) {
      const configurationName = IOSConfig.XcodeUtils.unquote(buildConfig.name);
      const mainBuildConfig = mainConfigurations.get(configurationName);
      Object.assign(buildConfig.buildSettings, {
        APPLICATION_EXTENSION_API_ONLY: 'YES',
        CLANG_ENABLE_MODULES: 'YES',
        CODE_SIGN_STYLE: 'Automatic',
        CURRENT_PROJECT_VERSION: String(xcodeConfig.ios?.buildNumber ?? '1'),
        GENERATE_INFOPLIST_FILE: 'NO',
        INFOPLIST_FILE: `${TARGET_NAME}/${TARGET_NAME}-Info.plist`,
        IPHONEOS_DEPLOYMENT_TARGET:
          mainBuildConfig?.buildSettings?.IPHONEOS_DEPLOYMENT_TARGET ??
          xcodeConfig.ios?.deploymentTarget ??
          '15.0',
        MARKETING_VERSION: String(xcodeConfig.version ?? '1.0.0'),
        PRODUCT_BUNDLE_IDENTIFIER: BUNDLE_IDENTIFIER,
        PRODUCT_NAME: `"${TARGET_NAME}"`,
        SKIP_INSTALL: 'YES',
        SWIFT_VERSION: '5.0',
        TARGETED_DEVICE_FAMILY: '"1,2"',
      });
    }

    return xcodeConfig;
  });
};

module.exports = createRunOncePlugin(
  withShadowChatNotificationServiceExtension,
  'with-shadowchat-notification-service-extension',
  '1.0.0'
);
