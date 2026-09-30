Pod::Spec.new do |s|
  s.name = 'ShadowChatClipboard'
  s.version = '1.0.0'
  s.summary = 'User-initiated movie clipboard transfer for ShadoChat'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'ShadoChat'
  s.homepage = 'https://shadochat.online'
  s.platforms = { :ios => '16.0' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end
