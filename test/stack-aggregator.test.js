const StackAggregator = require('../src/stack-aggregator')
const assert = require('assert')

describe('StackAggregator', () => {
  describe('.addStacks(buffer)', () => {
    it('adds each stack in the double-LF-separated output buffer', () => {
      const aggregator = new StackAggregator()

      aggregator.addStacks(Buffer.from([
        'aaa\n1',
        'bbb\naaa\n2',
        'bbb\naaa\n2',
        'ccc\nbbb\naaa\n3',
        'bbb\naaa\n2',
        'aaa\n1',
      ].join('\n\n') + '\n\n', 'utf8'))

      assert.deepEqual(aggregator.getCountedStacks(), {
        'aaa\n1': 2,
        'bbb\naaa\n2': 3,
        'ccc\nbbb\naaa\n3': 1
      })
    })
  })

  describe('.getCallTree()', () => {
    it('returns a tree representing all the stacks', () => {
      const aggregator = new StackAggregator()

      aggregator.addStack('aaa\n1')
      aggregator.addStack('bbb\naaa\n2')
      aggregator.addStack('ccc\nbbb\naaa\n3')
      aggregator.addStack('ccc\nbbb\naaa\n3')
      aggregator.addStack('bbb\naaa\n2')
      aggregator.addStack('ddd\nbbb\naaa\n3')
      aggregator.addStack('eee\n1')
      aggregator.addStack('eee\n1')

      const rootFrame = aggregator.getCallTree()
      assert.equal(rootFrame.sampleCount, 8)

      assert.deepEqual(rootFrame, {
        sampleCount: 8,
        childFrames: {
          'aaa': {
            sampleCount: 6,
            childFrames: {
              'bbb': {
                sampleCount: 5,
                childFrames: {
                  'ccc': {
                    sampleCount: 2,
                    childFrames: {}
                  },
                  'ddd': {
                    sampleCount: 1,
                    childFrames: {}
                  }
                }
              }
            }
          },
          'eee': {
            sampleCount: 2,
            childFrames: {}
          }
        }
      })
    })
  })

  describe('.getBlocksToRender()', () => {
    it('returns a flat list of positioned rectanges representing stack frames to render', () => {
      const aggregator = new StackAggregator(500) // 500 samples / second

      aggregator.addStack('bbb\naaa\n2')
      aggregator.addStack('aaa\n1')
      aggregator.addStack('ccc\nbbb\naaa\n2')
      aggregator.addStack('eee\n1')

      const blocks = aggregator.getBlocksToRender()

      assert.deepEqual(blocks.slice(0, 3), [
        {
          name: 'aaa',
          depth: 0,
          left: 0,
          width: 75,
          duration: 6
        },
        {
          name: 'bbb',
          depth: 1,
          left: 0,
          width: 50,
          duration: 4
        },
        {
          name: 'ccc',
          depth: 2,
          left: 0,
          width: 25,
          duration: 2
        }
      ])
    })
  })
})
