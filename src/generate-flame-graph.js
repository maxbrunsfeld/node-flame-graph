const fs = require('fs')
const path = require('path')
const temp = require("temp")
const {spawn} = require("child_process")
const StackAggregator = require('./stack-aggregator')

const FRAME_HEIGHT = 24

exports.generateFlameGraphForCommand = async function (command, options = {}) {
  const html = await generateFlameGraph(['-c', command], options)
  if (options.fullPage) {
    return wrapHTML(html)
  } else {
    return html
  }
}

exports.generateFlameGraphForProcess = async function (pid, options = {}) {
  const html = await generateFlameGraph(['-p', pid], options)
  if (options.fullPage) {
    return wrapHTML(html)
  } else {
    return html
  }
}

function generateFlameGraph (args, {env = {}, functionNameFilter, askpass} = {}) {
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

      fs.closeSync(stacksOutputFile.fd)
      fs.readFile(stacksOutputFile.path, 'utf8', (error, output) => {
        if (error) return reject(error)

        const aggregator = new StackAggregator(2000, functionNameFilter);
        aggregator.addStacks(output);
        resolve(renderFlameGraph(aggregator.getBlocksToRender()))
      })
    })
  })
}

function renderFlameGraph (data) {
  let maxDepth = 0

  let callDivs = ''
  for (let block of data) {
    if (block.depth > maxDepth) maxDepth = block.depth

    const name = escapeHTML(block.name.split('`').pop())
    const shortName = shortenFunctionName(name)

    callDivs += '\n'
      + `<div `
      + `  class="flame-graph-frame"`
      + `  title="name:\t${name}\nduration:\t${block.duration}ms" `
      + `  style="width: ${block.width}%; left: ${block.left}%; bottom: ${(block.depth * FRAME_HEIGHT)}px; height: ${FRAME_HEIGHT}px;"`
      + `>${shortName}</div>`
  }

  return (
    `<div class="flame-graph-scroll-view" style="height: ${maxDepth * FRAME_HEIGHT}px">` +
    '\n' +
    callDivs +
    '\n' +
    '</div>'
  )
}

function wrapHTML (content) {
  return [
    '<!DOCTYPE HTML>',
    '<head>',
    '<title>Flame Graph</title>',
    '<style>',
    fs.readFileSync(path.join(__dirname, 'style.css')),
    '</style>',
    '</head>',
    '<body>',
    content,
    '</body>'
  ].join('\n')
}

function escapeHTML(string) {
  return string
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function shortenFunctionName (name) {
  let result = name

  const parenIndex = result.indexOf('(')
  if (parenIndex > 0) result = result.slice(0, parenIndex)

  const colonIndex = result.lastIndexOf(':')
  if (colonIndex >= 0) result = result.slice(colonIndex + 1)

  return result
}
