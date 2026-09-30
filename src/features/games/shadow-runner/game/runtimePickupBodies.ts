import type Phaser from 'phaser'

export function configureShadowRunnerPickupBody(sprite: Phaser.Physics.Arcade.Sprite, radius: number) {
  const body = sprite.body as Phaser.Physics.Arcade.StaticBody
  // StaticBody.setCircle does not reposition after scale or frame changes.
  body.setCircle(radius, sprite.displayWidth / 2 - radius, sprite.displayHeight / 2 - radius)
  body.reset()
}

export function syncShadowRunnerPickupBody(sprite: Phaser.Physics.Arcade.Sprite, cameraLeft: number, cameraWidth: number) {
  const body = sprite.body as Phaser.Physics.Arcade.StaticBody | null
  if (!body?.enable || !sprite.active || sprite.getData('collected')
    || sprite.x < cameraLeft - 96 || sprite.x > cameraLeft + cameraWidth + 96) return
  // Keep the authored circle intact while visible pickup art bobs. RefreshBody
  // would replace its dimensions with the entire sprite frame.
  body.reset()
}
