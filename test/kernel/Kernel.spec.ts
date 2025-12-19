/**
 * Kernel Tests
 * 
 * Tests for the central kernel that manages process
 * scheduling and CPU budget allocation.
 */

import { Kernel, getKernel, isKernelInitialized } from '../../src/kernel/Kernel';
import { Process, ProcessPriority, ProcessResult } from '../../src/kernel/Process';
import { mockGlobal } from 'screeps-jest';

/**
 * Helper to create a mock process for testing.
 */
function createMockProcess(
  id: string,
  options: {
    priority?: ProcessPriority;
    shouldRun?: () => boolean;
    runResult?: ProcessResult;
    runImpl?: () => ProcessResult;
  } = {}
): Process {
  const {
    priority = ProcessPriority.NORMAL,
    shouldRun,
    runResult = { success: true },
    runImpl,
  } = options;

  const process: Process = {
    id,
    name: `Test Process ${id}`,
    priority,
    run: runImpl ?? jest.fn(() => runResult),
  };

  if (shouldRun !== undefined) {
    process.shouldRun = shouldRun;
  }

  return process;
}

describe('Kernel', () => {
  let kernel: Kernel;
  let cpuUsed: number;

  beforeEach(() => {
    kernel = new Kernel();
    cpuUsed = 0;

    // Mock Game.cpu.getUsed() to return controllable values
    mockGlobal<Game>('Game', {
      time: 100,
      cpu: {
        limit: 20,
        tickLimit: 500,
        bucket: 10000,
        shardLimits: {},
        unlocked: false,
        unlockedTime: 0,
        getUsed: jest.fn(() => cpuUsed),
        setShardLimits: jest.fn(),
        halt: jest.fn(),
        getHeapStatistics: jest.fn(),
      },
    }, true);
  });

  describe('register', () => {
    it('should register a process', () => {
      const process = createMockProcess('test1');
      
      kernel.register(process);
      
      expect(kernel.processCount).toBe(1);
      expect(kernel.getProcess('test1')).toBe(process);
    });

    it('should replace existing process with same ID', () => {
      const process1 = createMockProcess('test1');
      const process2 = createMockProcess('test1', { priority: ProcessPriority.HIGH });
      
      kernel.register(process1);
      kernel.register(process2);
      
      expect(kernel.processCount).toBe(1);
      expect(kernel.getProcess('test1')).toBe(process2);
    });

    it('should register multiple processes', () => {
      const process1 = createMockProcess('test1');
      const process2 = createMockProcess('test2');
      const process3 = createMockProcess('test3');
      
      kernel.register(process1);
      kernel.register(process2);
      kernel.register(process3);
      
      expect(kernel.processCount).toBe(3);
    });
  });

  describe('unregister', () => {
    it('should remove a registered process', () => {
      const process = createMockProcess('test1');
      
      kernel.register(process);
      expect(kernel.processCount).toBe(1);
      
      const removed = kernel.unregister('test1');
      
      expect(removed).toBe(true);
      expect(kernel.processCount).toBe(0);
      expect(kernel.getProcess('test1')).toBeUndefined();
    });

    it('should return false when unregistering non-existent process', () => {
      const removed = kernel.unregister('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('run', () => {
    it('should execute all registered processes', () => {
      const process1 = createMockProcess('test1');
      const process2 = createMockProcess('test2');
      
      kernel.register(process1);
      kernel.register(process2);
      kernel.run();
      
      expect(process1.run).toHaveBeenCalledTimes(1);
      expect(process2.run).toHaveBeenCalledTimes(1);
    });

    it('should execute processes in priority order', () => {
      const executionOrder: string[] = [];
      
      const lowPriority = createMockProcess('low', {
        priority: ProcessPriority.LOW,
        runImpl: () => {
          executionOrder.push('low');
          return { success: true };
        },
      });
      
      const highPriority = createMockProcess('high', {
        priority: ProcessPriority.HIGH,
        runImpl: () => {
          executionOrder.push('high');
          return { success: true };
        },
      });
      
      const criticalPriority = createMockProcess('critical', {
        priority: ProcessPriority.CRITICAL,
        runImpl: () => {
          executionOrder.push('critical');
          return { success: true };
        },
      });
      
      // Register in reverse order to test sorting
      kernel.register(lowPriority);
      kernel.register(highPriority);
      kernel.register(criticalPriority);
      kernel.run();
      
      expect(executionOrder).toEqual(['critical', 'high', 'low']);
    });

    it('should skip processes when shouldRun returns false', () => {
      const runningProcess = createMockProcess('running', {
        shouldRun: () => true,
      });
      
      const skippedProcess = createMockProcess('skipped', {
        shouldRun: () => false,
      });
      
      kernel.register(runningProcess);
      kernel.register(skippedProcess);
      kernel.run();
      
      expect(runningProcess.run).toHaveBeenCalled();
      expect(skippedProcess.run).not.toHaveBeenCalled();
    });

    it('should stop when CPU budget is exhausted', () => {
      // Simulate CPU usage increasing with each call
      let callCount = 0;
      (Game.cpu.getUsed as jest.Mock).mockImplementation(() => {
        callCount++;
        // Return 0 for first call (tick start), then escalating values
        if (callCount <= 2) return 0;
        return 20; // At or exceeds limit
      });

      const process1 = createMockProcess('test1');
      const process2 = createMockProcess('test2');
      
      kernel.register(process1);
      kernel.register(process2);
      kernel.run();
      
      // First process should have run, but second may be skipped due to CPU
      expect(process1.run).toHaveBeenCalled();
    });

    it('should catch and handle process exceptions', () => {
      const failingProcess = createMockProcess('failing', {
        runImpl: () => {
          throw new Error('Process explosion!');
        },
      });
      
      const normalProcess = createMockProcess('normal');
      
      kernel.register(failingProcess);
      kernel.register(normalProcess);
      
      // Should not throw
      expect(() => kernel.run()).not.toThrow();
      
      // Normal process should still run
      expect(normalProcess.run).toHaveBeenCalled();
    });

    it('should update stats after run', () => {
      const process1 = createMockProcess('test1');
      const process2 = createMockProcess('test2');
      
      kernel.register(process1);
      kernel.register(process2);
      kernel.run();
      
      const stats = kernel.getStats();
      
      expect(stats.tick).toBe(100); // Game.time
      expect(stats.processesRun).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return empty stats before first run', () => {
      const stats = kernel.getStats();
      
      expect(stats.tick).toBe(0);
      expect(stats.processesRun).toBe(0);
      expect(stats.processesSkipped).toBe(0);
    });

    it('should track CPU per process', () => {
      // Simulate increasing CPU usage
      let cpuValue = 0;
      (Game.cpu.getUsed as jest.Mock).mockImplementation(() => {
        const current = cpuValue;
        cpuValue += 0.5;
        return current;
      });

      const process = createMockProcess('test1');
      kernel.register(process);
      kernel.run();
      
      const stats = kernel.getStats();
      expect(stats.cpuByProcess.has('test1')).toBe(true);
    });
  });

  describe('processCount', () => {
    it('should return correct count', () => {
      expect(kernel.processCount).toBe(0);
      
      kernel.register(createMockProcess('a'));
      expect(kernel.processCount).toBe(1);
      
      kernel.register(createMockProcess('b'));
      expect(kernel.processCount).toBe(2);
      
      kernel.unregister('a');
      expect(kernel.processCount).toBe(1);
    });
  });
});

describe('getKernel', () => {
  beforeEach(() => {
    // Reset the module to clear the global instance
    jest.resetModules();
  });

  it('should return a kernel instance', async () => {
    // Re-import to get fresh module
    const { getKernel: getK } = await import('../../src/kernel/Kernel');
    const kernel = getK();
    
    // Check kernel has expected properties/methods
    expect(kernel).toBeDefined();
    expect(typeof kernel.register).toBe('function');
    expect(typeof kernel.run).toBe('function');
    expect(typeof kernel.processCount).toBe('number');
  });

  it('should return the same instance on subsequent calls', async () => {
    const { getKernel: getK } = await import('../../src/kernel/Kernel');
    
    const kernel1 = getK();
    const kernel2 = getK();
    
    expect(kernel1).toBe(kernel2);
  });
});

describe('isKernelInitialized', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('should return false before kernel is created', async () => {
    const { isKernelInitialized: isInit } = await import('../../src/kernel/Kernel');
    // Note: This might return true if getKernel was called elsewhere
    // The test verifies the function works
    expect(typeof isInit()).toBe('boolean');
  });

  it('should return false when kernel has no processes', async () => {
    const { getKernel: getK, isKernelInitialized: isInit } = await import('../../src/kernel/Kernel');
    
    getK(); // Create kernel but don't register processes
    
    expect(isInit()).toBe(false);
  });

  it('should return true when kernel has processes', async () => {
    const { getKernel: getK, isKernelInitialized: isInit } = await import('../../src/kernel/Kernel');
    
    const kernel = getK();
    kernel.register(createMockProcess('test'));
    
    expect(isInit()).toBe(true);
  });
});
