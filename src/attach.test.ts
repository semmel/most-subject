import { Scheduler, Stream } from '@most/types'
import { Test, describe, given, it } from '@typed/test'
import {
  at,
  continueWith,
  delay,
  mergeArray,
  runEffects,
  tap,
  throwError,
} from '@most/core'

import { attach } from './attach'
import { create } from './create'
import { newDefaultScheduler } from '@most/scheduler'

export const test: Test = describe(`attach`, [
  given(`Sink<A> and Stream<A>`, [
    it(`attaches a Stream via Sink as source to the already subscribed-to 'create' Stream`, ({
      equal,
    }) => {
      const expected = [0, 1, 2]

      const scheduler = newDefaultScheduler()
      const [sink, sut] = create<number>()
      const stream = mergeArray<Stream<number>[]>(expected.map(x => at(x, x)))

      const promise = collectEvents(scheduler, sut)

      // stream 0 1 2 -> sut 0 1 2
      attach(sink, stream)

      return promise.then(equal(expected))
    }),

    it('the already subscribed-to source ends with the error of the attached origin', ({
      equal,
      notOk,
    }) => {
      const scheduler = newDefaultScheduler(),
        [sinkStream, stream] = create<number>(),
        sampleError = new Error('sample error'),
        origin = continueWith(() => throwError(sampleError), at(10, 5)),
        outcome = runEffects(tap(equal(5), stream), scheduler).then(
          () => notOk(true),
          equal(sampleError)
        )

      attach(sinkStream, origin)

      return outcome
    }),

    it(`attaches a Stream via Sink as source to the 'create' Stream which is subscribed to afterwards`, ({
      equal,
    }) => {
      const expected = [0, 1, 2]

      const scheduler = newDefaultScheduler()
      const [sink, sut] = create<number>()
      const stream = mergeArray<Stream<number>[]>(expected.map(x => at(x, x)))

      // stream 0 1 2 -> sut 0 1 2
      attach(sink, stream)

      return collectEvents(scheduler, sut).then(equal(expected))
    }),

    it('ends with the error of the attached origin', ({ equal, notOk }) => {
      const scheduler = newDefaultScheduler(),
        [sinkStream, stream] = create<number>(),
        sampleError = new Error('sample error'),
        origin = continueWith(() => throwError(sampleError), at(10, 5))

      attach(sinkStream, origin)

      return runEffects(tap(equal(5), stream), scheduler).then(
        () => notOk(true),
        equal(sampleError)
      )
    }),

    it(`allows reattaching after completion`, ({ equal }) => {
      const scheduler = newDefaultScheduler(),
        // Stream a -> Promise a[]
        drain: <A>(s: Stream<A>) => Promise<A[]> = collectEvents.bind(
          undefined,
          scheduler
        ),
        [sink, stream] = create<number>(),
        // 10 - 11 - 12|
        origin = mergeArray<Stream<number>[]>([10, 11, 12].map(x => at(x, x)))

      attach(sink, origin)

      return drain(delay(100, stream))
        .then(xs => new Promise<number[]>(res => setTimeout(res, 100, xs)))
        .then(events => {
          equal([10, 11, 12])(events)
          attach(sink, origin)
          return stream
        })
        .then(s => new Promise<Stream<number>>(res => setTimeout(res, 100, s)))
        .then(drain)
        .then(equal([10, 11, 12]))
    }),
  ]),
])

function collectEvents<A>(
  scheduler: Scheduler,
  stream: Stream<A>
): Promise<Array<A>> {
  const events: Array<A> = []

  return runEffects(tap(x => events.push(x), stream), scheduler).then(
    () => events
  )
}
