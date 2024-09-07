const debug = require('debug')('vhs-hookhub-google-forms-slack')
debug('Loading vhs-hookhub-google-forms-slack')
debug(__dirname)

const express = require('express')
const router = express.Router()
const config = require('./config.json')
const smb = require('slack-message-builder')
const { createHmac } = require('node:crypto')

const isValid = (val) => val != null && typeof val === 'string' && val !== ''

// Perform sanity check
router.use(function (req, res, next) {
    const formId = req.header('X-Hookhub-Google-Form-Id')
    const formHash = req.header('X-Hookhub-Google-Form-Hash')
    const formTS = req.header('X-Hookhub-Google-Form-TS')

    if (!isValid(formId) || !isValid(formTS) || Number.isNaN(formTS) || !isValid(formHash) || !isValid(req.rawBody)) {
        res.status(412).send({
            result: 'ERROR',
            message: 'Missing or invalid request arguments'
        })
    } else {
        res.locals.formId = formId
        res.locals.formHash = formHash
        res.locals.formTS = Number(formTS)

        next()
    }
})

router.use(function (req, res, next) {
    if (config.forms[res.locals.formId] == null) {
        res.status(401).send({
            result: 'ERROR',
            message: 'Invalid form'
        })
    } else {
        res.locals.formConfig = { id: res.locals.formId, ...config.forms[res.locals.formId] }

        next()
    }
})

router.use(function (req, res, next) {
    const verifyKey = `${res.locals.formID}.${res.locals.formTS}.${res.locals.formConfig.secret}`

    const verifyHash = createHmac('sha256', verifyKey).update(req.rawBody).digest('hex')

    if (verifyHash !== res.locals.formHash) {
        res.status(403).send({
            result: 'ERROR',
            message: 'Invalid hash'
        })
    } else if (res.locals.formTS < Date.now() - 1000) {
        res.status(400).send({
            result: 'ERROR',
            message: 'Invalid ts'
        })
    } else {
        next()
    }
})

/* Default handler. */
router.use('/', async function (req, res, next) {
    debug('Handling default request')

    let post_body = generateMessage(res.locals.formConfig, req.body)

    debug('post_body:', post_body)

    const post_options = {
        method: 'POST',
        body: JSON.stringify(post_body)
    }

    try {
        const data = await (await fetch(config.slack.url, post_options)).json()

        res.send({
            result: 'OK',
            message: data
        })
    } catch (err) {
        res.status(500).send({
            result: 'ERROR',
            message: err
        })
    }
})

module.exports = router

const generateMessage = function (formConfig, payload) {
    const slackOptions = { ...config.slack.options, ...formConfig.slack.options }
    const filters = formConfig.slack.filter ?? []

    const withAnswers = formConfig.slack.answers ?? true
    const withFilters = filters.length

    let slack_message = smb()
        .username(slackOptions.username)
        .iconEmoji(slackOptions.icon_emoji)
        .channel(slackOptions.channel)

    slack_message = slack_message.text(
        `There is a new entry for the ${formConfig.slack.title} form!${(withAnswers || withFilters) && '\r\r'}`
    )

    if (withAnswers || withFilters) {
        slack_message = slack_message
            .attachment()
            .fallback(
                Object.entries(getFilteredAnswers(payload, filters))
                    .map((e) => `- ${e.join(': ')}`)
                    .join('\n')
            )
            .color('#0000cc')
            .authorName(formConfig.slack.title)
            .authorLink(`https://docs.google.com/forms/d/${formConfig.id}/view`)
            .title(formConfig.slack.title)
            .titleLink(`https://docs.google.com/forms/d/${formConfig.id}/view`)
            .text('Form Results:')

        Object.entries(getFilteredAnswers(payload, filters)).forEach(([k, v]) => {
            slack_message = slack_message.fields({
                title: k,
                value: v,
                short: false
            })
        })

        slack_message = slack_message
            .footer('Via: vhs/hookhub-hook-google-forms-slack')
            .ts(Date.now() / 1000)
            .end()
    }

    return slack_message.json()
}

const getFilteredAnswers = (answers, filter) => {
    if (filter.length === 0) return answers

    return Object.entries(answers)
        .filter(([k, v]) => filter.includes(k))
        .reduce((c, [k, v]) => {
            return { ...c, [k]: v }
        }, {})
}
