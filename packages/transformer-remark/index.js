const remark = require('remark')
const parse = require('gray-matter')
const visit = require('unist-util-visit')
const toHAST = require('mdast-util-to-hast')
const hastToHTML = require('hast-util-to-html')
const { HeadingType, HeadingLevels } = require('./lib/types/HeadingType')

const {
  GraphQLList,
  GraphQLString
} = require('gridsome/graphql')

class RemarkTransformer {
  static mimeTypes () {
    return ['text/markdown', 'text/x-markdown']
  }

  constructor (options, { nodeCache }) {
    this.options = options
    this.nodeCache = nodeCache

    // built-in plugins
    this.remarkPlugins = [
      [require('remark-slug')],
      [require('remark-autolink-headings'), {
      'remark-squeeze-paragraphs',
      ['remark-external-links', {
        target: options.externalLinksTarget,
        rel: options.externalLinksRel
      }],
        content: {
          type: 'element',
          tagName: 'span',
          properties: {
            className: options.anchorClassName || ['icon icon-link']
          },
        }
      }]
    ]
  }

  parse (source, options) {
    const file = parse(source, this.options.frontmatter || {})

    return {
      fields: file.data,
      content: file.content,
      excerpt: file.excerpt
    }
  }

  extendNodeType () {
    return {
      content: {
        type: GraphQLString,
        resolve: node => this.toHTML(node)
      },
      headings: {
        type: new GraphQLList(HeadingType),
        args: {
          depth: { type: HeadingLevels }
        },
        resolve: (node, { depth }) => {
          return this.findHeadings(node, depth).filter(heading => {
            return typeof depth === 'number'
              ? heading.depth === depth
              : true
          })
        }
      }
    }
  }

  toAST (node) {
    return this.nodeCache(node, 'ast', () => {
      const ast = remark().parse(node.internal.content)

      // apply remark transforms to ast
      for (const [plugin, options] of this.remarkPlugins) {
        plugin(options)(ast)
      }

      return ast
    })
  }

  toHAST (node) {
    return this.nodeCache(node, 'hast', () => {
      const mdast = this.toAST(node)
      return toHAST(mdast, { allowDangerousHTML: true })
    })
  }

  toHTML (node) {
    return this.nodeCache(node, 'html', () => {
      const hast = this.toHAST(node)
      return hastToHTML(hast, { allowDangerousHTML: true })
    })
  }

  findHeadings (node) {
    return this.nodeCache(node, 'headings', () => {
      const ast = this.toAST(node)
      const headings = []

      visit(ast, 'heading', node => {
        const heading = { depth: node.depth, value: '', anchor: '' }

        visit(node, 'link', link => heading.anchor = link.url)
        visit(node, 'text', text => heading.value = text.value)

        headings.push(heading)
      })

      return headings
    })
  }
}

module.exports = RemarkTransformer
