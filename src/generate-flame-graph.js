const fs = require('fs')
const path = require('path')
const temp = require("temp")
const {spawn} = require("child_process")
const StackAggregator = require('./stack-aggregator')

exports.getFlameGraphLayout = function (content) {
  return [
    '<!DOCTYPE HTML>',
    '<head>',
    '<style>',
    fs.readFileSync(path.join(__dirname, 'style.css')),
    '</style>',
    '</head>',
    '<body>',
    content,
    '</body>'
  ].join('\n')
}

exports.generateFlameGraphForCommand = async function (command, env, options) {
  const flameGraphData = await generateFlameGraph(['-c', command], env, options)
  return renderFlameGraph(flameGraphData)
}

exports.generateFlameGraphForProcess = async function (pid, env, options) {
  const flameGraphData = await generateFlameGraph(['-p', pid], env, options)
  return renderFlameGraph(flameGraphData)
}

function generateFlameGraph (args, env, {functionNameFilter, askpass}) {
  const stacksOutputFile = temp.openSync({prefix: 'trace.out'})

  const dtraceProcess = spawn('sudo', [
    ...(askpass ? ['-A'] : []),
    'dtrace',
    '-x', 'ustackframes=100',
    '-n', 'profile-2000 /pid == $target/ { @num[ustack()] = count(); }',
    ...args
  ], {
    env: Object.assign(
      {},
      process.env,
      env
    ),
    stdio: [
      'ignore',
      stacksOutputFile.fd,
      'pipe'
    ]
  })

  let stderr = ''
  dtraceProcess.stderr.on('data', (data) => {
    stderr += data.toString('utf8')
  })

  return new Promise((resolve, reject) => {
    dtraceProcess.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Dtrace processes failed. Code: ${code}, Stderr: ${stderr}`))
      }

      fs.readFile(stacksOutputFile.path, 'utf8', (error, output) => {
        if (error) return reject(error)

        const aggregator = new StackAggregator(2000, functionNameFilter);
        aggregator.addStacks(output);
        resolve(aggregator.getBlocksToRender())
      })
    })
  })
}

const FRAME_HEIGHT = 24

function renderFlameGraph (data) {
  let maxDepth = 0

  let callDivs = ''
  for (let block of data) {
    if (block.depth > maxDepth) maxDepth = block.depth;
    const name = block.name.split('`').pop();
    callDivs += '\n'
      + `<div `
      + `  class="flame-graph-frame"`
      + `  title="name:\t${name}\nduration:\t${block.duration}ms" `
      + `  style="width: ${block.width}%; left: ${block.left}%; bottom: ${(block.depth * FRAME_HEIGHT)}px; height: ${FRAME_HEIGHT}px;"`
      + `>${name}</div>`
  }

  return
    `<div class="flame-graph-scroll-view" style="height: ${maxDepth * FRAME_HEIGHT}px">` +
    '\n' +
    callDivs +
    '\n' +
    '</div>'
  `
}
