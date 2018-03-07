module.exports =
class StackAggregator {
  constructor (sampleRate, functionNames) {
    this.sampleRate = sampleRate
    this.functionNames = functionNames
    if (typeof this.functionNames === 'string') {
      this.functionNames = [this.functionNames]
    }
    this.countedStacks = {}
  }

  getCountedStacks () {
    return Object.assign({}, this.countedStacks)
  }

  addStacks (stacks) {
    let index = 0
    while (true) {
      const stackEndIndex = stacks.indexOf('\n\n', index, 'utf8')
      if (stackEndIndex === -1) break
      this.addStack(stacks.slice(index, stackEndIndex).toString('utf8'))
      index = stackEndIndex + 2
    }
    return index
  }

  addStack (stack) {
    let truncatedStack
    if (this.functionNames && this.functionNames.length > 0) {
      let functionNameIndex = -1
      for (const functionName of this.functionNames) {
        const index = stack.lastIndexOf(functionName)
        if (index > functionNameIndex) functionNameIndex = index
      }
      if (functionNameIndex !== -1) {
        const truncatedEndIndex = stack.indexOf('\n', functionNameIndex)
        truncatedStack = stack.slice(0, truncatedEndIndex) + stack.slice(stack.lastIndexOf('\n'))
      }
    } else {
      truncatedStack = stack
    }

    if (truncatedStack) {
      if (this.countedStacks[truncatedStack]) {
        this.countedStacks[truncatedStack]++
      } else {
        this.countedStacks[truncatedStack] = 1
      }
    }
  }

  getCallTree () {
    const rootFrame = {childFrames: {}, sampleCount: 0}
    const stackStrings = Object.keys(this.countedStacks)
    for (let i = 0, n = stackStrings.length; i < n; i++) {
      const stackString = stackStrings[i]
      const sampleCount = this.countedStacks[stackString]
      const frameStrings = stackString.split('\n')

      rootFrame.sampleCount += sampleCount
      let frame = rootFrame
      for (let j = frameStrings.length - 2; j >= 0; j--) {
        const frameString = frameStrings[j].trim().split('+')[0]
        let childFrame = frame.childFrames[frameString]
        if (!childFrame) {
          childFrame = frame.childFrames[frameString] = {childFrames: {}, sampleCount: 0}
        }
        childFrame.sampleCount += sampleCount
        frame = childFrame
      }
    }
    return rootFrame
  }

  getBlocksToRender () {
    function addFrame (name, frame, depth, precedingSampleCount) {
      if (name) {
        blocks.push({
          name: name,
          depth: depth,
          left: precedingSampleCount / totalSampleCount * 100,
          width: frame.sampleCount / totalSampleCount * 100,
          duration: frame.sampleCount / sampleRate * 1000
        })
      }

      depth++

      for (let childFrameName of Object.keys(frame.childFrames).sort()) {
        const childFrame = frame.childFrames[childFrameName]
        addFrame(childFrameName, childFrame, depth, precedingSampleCount)
        precedingSampleCount += childFrame.sampleCount
      }
    }

    const blocks = []
    const rootFrame = this.getCallTree()
    const totalSampleCount = rootFrame.sampleCount
    const sampleRate = this.sampleRate
    addFrame(null, rootFrame, -1, 0)
    return blocks
  }
}
