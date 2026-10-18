// /dental's scene: the nacre pearl (pearl-nacre.ts) moved, lifted, rolled and polished by physics.ts.
// The stage draws it inside the .orb root's box on the fixed canvas; physics moves that box around the day sheet.
import { createNacre } from './pearl-nacre';
import { createPhysics } from './physics';
import type { OrbScene } from '../../../scripts/orb/stage';

export function createScene(root: HTMLElement): OrbScene {
  const physics = createPhysics(root);
  const nacre = createNacre();
  window.amariyaPearl = physics.api;
  return {
    alpha: true,
    setup: (renderer) => nacre.setup(renderer),
    // The camera follows the root's box every frame (OrbFrame.view), not the canvas
    resize() {},
    update(f) {
      physics.sync(f);
      nacre.update(f, physics.frame());
    },
    render: (renderer) => nacre.render(renderer),
    degrade: () => nacre.degrade(),
    dispose() {
      physics.dispose();
      nacre.dispose();
      if (window.amariyaPearl === physics.api) delete window.amariyaPearl;
    },
  };
}
