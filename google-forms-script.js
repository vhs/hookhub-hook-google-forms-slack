const POST_URL = 'https://hookhub.vanhack.ca/hooks/google-forms-slack'

const FORM_SECRET = 'TBD'

function toHexString(byteArray) {
    return Array.from(byteArray, function (byte) {
        return ('0' + (byte & 0xff).toString(16)).slice(-2)
    }).join('')
}

function onSubmit(e) {
    const form = FormApp.getActiveForm()
    const formId = form.getId()

    const allResponses = form.getResponses()

    if (allResponses.length === 0) return

    const latestResponse = allResponses[allResponses.length - 1]

    const response = latestResponse.getItemResponses()

    const payload = {}

    for (let i = 0; i < response.length; i++) {
        const question = response[i].getItem().getTitle()
        const answer = response[i].getResponse()
        payload[question] = answer
    }

    const requestTS = Date.now().toString()
    const jsonPayload = JSON.stringify(payload)

    const requestKey = `${formId}.${requestTS}.${FORM_SECRET}`

    const requestHashBytes = Utilities.computeHmacSha256Signature(jsonPayload, requestKey)

    Logger.log(requestHashBytes)

    const requestHash = toHexString(requestHashBytes)

    Logger.log(requestHash)

    const options = {
        method: 'post',
        contentType: 'application/json',
        headers: {
            'X-Hookhub-Google-Form-Id': formId,
            'X-Hookhub-Google-Form-Title': form.getTitle(),
            'X-Hookhub-Google-Form-TS': requestTS,
            'X-Hookhub-Google-Form-Hash': requestHash
        },
        payload: jsonPayload
    }

    UrlFetchApp.fetch(POST_URL, options)
}
