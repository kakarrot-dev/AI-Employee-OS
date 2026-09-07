import { expect, it } from 'vitest'
import { MemoryService } from './memory-service'

it('reports a missing interpreter without masking it with a stderr TypeError', () => {
  const service = new MemoryService({ pythonPath: '/nonexistent/ai-employee-memory-python', scriptPath: '/nonexistent/worker.py', databasePath: '/nonexistent/memory.sqlite', modelCachePath: '/nonexistent/models', keychainHelperPath: '/nonexistent/helper' })
  expect(() => service.status()).toThrow('memory_runtime_missing')
})
