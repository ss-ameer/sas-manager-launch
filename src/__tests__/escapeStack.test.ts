import assert from 'node:assert/strict';
import {
  ESCAPE_PRIORITY_DRAWER,
  ESCAPE_PRIORITY_STUDIO,
  ESCAPE_PRIORITY_ELEVATED_DRAWER,
  ESCAPE_PRIORITY_NESTED_MODAL,
  ESCAPE_PRIORITY_BLOCKING_DIALOG,
  registerEscapeLayer,
  dispatchTopEscapeLayer,
  getEscapeStackSnapshot,
  resetEscapeStackForTests
} from '../utils/escapeStack';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  resetEscapeStackForTests();
  try {
    fn();
    passed += 1;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL: ${name}`);
    console.error(err);
  } finally {
    resetEscapeStackForTests();
  }
}

console.log('Running escapeStack unit tests...');

test('priority ordering strictly resolves 120 > 100 > 90 > 80 > 60 regardless of registration order', () => {
  const calls: string[] = [];

  // Register out of order to ensure priority beats registration order
  const unregNested = registerEscapeLayer({
    id: 'nested-modal',
    priority: ESCAPE_PRIORITY_NESTED_MODAL,
    onEscape: () => {
      calls.push('nested');
    }
  });
  const unregDrawer = registerEscapeLayer({
    id: 'drawer',
    priority: ESCAPE_PRIORITY_DRAWER,
    onEscape: () => {
      calls.push('drawer');
    }
  });
  const unregBlocking = registerEscapeLayer({
    id: 'blocking-dialog',
    priority: ESCAPE_PRIORITY_BLOCKING_DIALOG,
    onEscape: () => {
      calls.push('blocking');
    }
  });
  const unregStudio = registerEscapeLayer({
    id: 'studio',
    priority: ESCAPE_PRIORITY_STUDIO,
    onEscape: () => {
      calls.push('studio');
    }
  });
  const unregElevated = registerEscapeLayer({
    id: 'elevated-drawer',
    priority: ESCAPE_PRIORITY_ELEVATED_DRAWER,
    onEscape: () => {
      calls.push('elevated');
    }
  });

  const snapshotIds = getEscapeStackSnapshot().map((entry) => entry.id);
  assert.deepEqual(snapshotIds, [
    'blocking-dialog',
    'nested-modal',
    'elevated-drawer',
    'studio',
    'drawer'
  ]);

  assert.equal(dispatchTopEscapeLayer().layerId, 'blocking-dialog');
  assert.deepEqual(calls, ['blocking']);
  unregBlocking();

  assert.equal(dispatchTopEscapeLayer().layerId, 'nested-modal');
  assert.deepEqual(calls, ['blocking', 'nested']);
  unregNested();

  assert.equal(dispatchTopEscapeLayer().layerId, 'elevated-drawer');
  assert.deepEqual(calls, ['blocking', 'nested', 'elevated']);
  unregElevated();

  assert.equal(dispatchTopEscapeLayer().layerId, 'studio');
  assert.deepEqual(calls, ['blocking', 'nested', 'elevated', 'studio']);
  unregStudio();

  assert.equal(dispatchTopEscapeLayer().layerId, 'drawer');
  assert.deepEqual(calls, ['blocking', 'nested', 'elevated', 'studio', 'drawer']);
  unregDrawer();

  assert.equal(getEscapeStackSnapshot().length, 0);
  const emptyResult = dispatchTopEscapeLayer();
  assert.equal(emptyResult.handled, false);
  assert.equal(emptyResult.layerId, null);
});

test('LIFO tie-breaking within the same priority tier dismisses most recently registered layer first', () => {
  const dismissed: string[] = [];

  const unregFirst = registerEscapeLayer({
    id: 'modal-a',
    priority: ESCAPE_PRIORITY_NESTED_MODAL,
    onEscape: () => {
      dismissed.push('modal-a');
      unregFirst();
    }
  });
  const unregSecond = registerEscapeLayer({
    id: 'modal-b',
    priority: ESCAPE_PRIORITY_NESTED_MODAL,
    onEscape: () => {
      dismissed.push('modal-b');
      unregSecond();
    }
  });
  const unregThird = registerEscapeLayer({
    id: 'modal-c',
    priority: ESCAPE_PRIORITY_NESTED_MODAL,
    onEscape: () => {
      dismissed.push('modal-c');
      unregThird();
    }
  });

  assert.deepEqual(
    getEscapeStackSnapshot().map((e) => e.id),
    ['modal-c', 'modal-b', 'modal-a']
  );

  dispatchTopEscapeLayer();
  dispatchTopEscapeLayer();
  dispatchTopEscapeLayer();

  assert.deepEqual(dismissed, ['modal-c', 'modal-b', 'modal-a']);
  assert.equal(getEscapeStackSnapshot().length, 0);
});

test('veto (return false) stops fall-through so lower layers are NEVER invoked behind a busy or mandatory modal', () => {
  const calls: string[] = [];

  registerEscapeLayer({
    id: 'parent-drawer',
    priority: ESCAPE_PRIORITY_DRAWER,
    onEscape: () => {
      calls.push('parent-drawer');
    }
  });

  registerEscapeLayer({
    id: 'mandatory-onboarding',
    priority: ESCAPE_PRIORITY_BLOCKING_DIALOG,
    onEscape: () => {
      calls.push('mandatory-veto');
      return false;
    }
  });

  const first = dispatchTopEscapeLayer();
  assert.equal(first.handled, true);
  assert.equal(first.vetoed, true);
  assert.equal(first.layerId, 'mandatory-onboarding');

  const second = dispatchTopEscapeLayer();
  assert.equal(second.handled, true);
  assert.equal(second.vetoed, true);
  assert.equal(second.layerId, 'mandatory-onboarding');

  assert.deepEqual(calls, ['mandatory-veto', 'mandatory-veto']);
});

test('sequential dismissal and idempotent unregister cleanly restore lower layers', () => {
  let studioOpen = true;
  let drawerOpen = true;

  const unregDrawer = registerEscapeLayer({
    id: 'enquiry-drawer',
    priority: ESCAPE_PRIORITY_DRAWER,
    onEscape: () => {
      drawerOpen = false;
      unregDrawer();
    }
  });

  const unregStudio = registerEscapeLayer({
    id: 'quotation-studio',
    priority: ESCAPE_PRIORITY_STUDIO,
    onEscape: () => {
      studioOpen = false;
      unregStudio();
    }
  });

  // First Escape closes studio only
  const r1 = dispatchTopEscapeLayer();
  assert.equal(r1.layerId, 'quotation-studio');
  assert.equal(studioOpen, false);
  assert.equal(drawerOpen, true);

  // Calling unregister again must be a safe no-op
  unregStudio();
  assert.equal(getEscapeStackSnapshot().length, 1);

  // Second Escape closes underlying drawer
  const r2 = dispatchTopEscapeLayer();
  assert.equal(r2.layerId, 'enquiry-drawer');
  assert.equal(drawerOpen, false);
  assert.equal(getEscapeStackSnapshot().length, 0);
});

test('window keydown listener attaches lazily, detaches when empty, ignores defaultPrevented/isComposing, and preventsDefault on handled & vetoed Escape', () => {
  const listeners = new Map<string, Set<(e: any) => void>>();
  let addCount = 0;
  let removeCount = 0;

  const mockWindow = {
    addEventListener(type: string, fn: (e: any) => void) {
      addCount += 1;
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: any) => void) {
      removeCount += 1;
      listeners.get(type)?.delete(fn);
    },
    dispatchKeyDown(event: any) {
      const set = listeners.get('keydown');
      if (!set) return;
      for (const fn of [...set]) {
        fn(event);
      }
    }
  };

  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = mockWindow;

  try {
    let calls = 0;
    let shouldVeto = false;

    // Registering first layer attaches exactly one window listener
    const unreg1 = registerEscapeLayer({
      id: 'layer-1',
      priority: ESCAPE_PRIORITY_DRAWER,
      onEscape: () => {
        calls += 1;
        return shouldVeto ? false : true;
      }
    });
    assert.equal(addCount, 1);
    assert.equal(removeCount, 0);

    // Registering a second layer must NOT attach a duplicate listener
    const unreg2 = registerEscapeLayer({
      id: 'layer-2',
      priority: ESCAPE_PRIORITY_NESTED_MODAL,
      onEscape: () => {
        calls += 10;
        return shouldVeto ? false : true;
      }
    });
    assert.equal(addCount, 1);

    // Non-Escape key ignored
    let prevented = false;
    mockWindow.dispatchKeyDown({
      key: 'Enter',
      defaultPrevented: false,
      isComposing: false,
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(calls, 0);
    assert.equal(prevented, false);

    // Already-prevented Escape (e.g. inline Quick Edit or @mention popover) is ignored
    mockWindow.dispatchKeyDown({
      key: 'Escape',
      defaultPrevented: true,
      isComposing: false,
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(calls, 0);
    assert.equal(prevented, false);

    // IME composing Escape is ignored
    mockWindow.dispatchKeyDown({
      key: 'Escape',
      defaultPrevented: false,
      isComposing: true,
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(calls, 0);
    assert.equal(prevented, false);

    // Vetoed Escape still calls preventDefault and invokes ONLY top layer
    shouldVeto = true;
    mockWindow.dispatchKeyDown({
      key: 'Escape',
      defaultPrevented: false,
      isComposing: false,
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(calls, 10);
    assert.equal(prevented, true);

    // Normal Escape calls preventDefault and invokes ONLY top layer
    shouldVeto = false;
    prevented = false;
    mockWindow.dispatchKeyDown({
      key: 'Escape',
      defaultPrevented: false,
      isComposing: false,
      preventDefault: () => {
        prevented = true;
      }
    });
    assert.equal(calls, 20);
    assert.equal(prevented, true);

    // Unregistering top layer keeps listener attached while layer-1 remains
    unreg2();
    assert.equal(removeCount, 0);

    // Unregistering last layer detaches global window listener
    unreg1();
    assert.equal(removeCount, 1);
    assert.equal(listeners.get('keydown')?.size ?? 0, 0);
  } finally {
    resetEscapeStackForTests();
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  }
});

console.log(`escapeStack tests complete: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
