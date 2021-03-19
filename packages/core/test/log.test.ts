import * as bp from "../src/bid";
import { testScenarios } from './testutils';
import { scenario } from '../src/scenario';
import { delay } from './testutils';
import { BThreadContext } from '../src/bthread';
import { BThreadReactionType, ScaffoldingResultType } from "../src";

test("log will contain a list of executed actions (sorted)", () => {
    const flow1 = scenario(
        {
          id: "flow1",
          description: "user is able to select a product"
        },
        function*(this: BThreadContext) {
          this.section("productList");
          const id = yield bp.askFor("selectProduct");
          const item = yield bp.request("apiGetProductDetails", "testData");
          yield bp.set({ name: "productDetails", key: id }, item);
          this.section("productDetails");
          yield bp.askFor("acceptAGB");
          this.section("new Section");
          yield bp.set("agbAccepted", "true");
        }
      );
      
      const flow2 = scenario(
        {
          id: "flow2",
          description: "count actions"
        },
        function*() {
            yield bp.request("selectProduct");
            yield bp.trigger("acceptAGB");
        }
      );

      testScenarios((enable) => {
        enable(flow1());
        enable(flow2());
    }, ({log}) => {
        expect(log.actions[0]?.eventId.name).toBe('selectProduct');
        expect(log.actions[1]?.eventId.name).toBe('apiGetProductDetails');
        expect(log.actions[2]?.eventId.name).toBe('productDetails');
        expect(log.actions[3]?.eventId.name).toBe('acceptAGB');
        expect(log.actions[4]?.eventId.name).toBe('agbAccepted');
    });
})

test("the actions in a log will contain info, if and when the promise got resolved.", (done) => {

  const thread1 = scenario({id: 'thread1', description: 'myThread1'}, function* () {
      yield bp.request('asyncRequest', () => delay(10, 'value'));
      yield bp.request('request2');
  });

  testScenarios((enable) => {
      enable(thread1());
  }, ({log, thread}) => {
    if(thread.get({name: 'thread1'})?.isCompleted) {
      expect(log.actions[1]?.payload).toEqual('value');
      expect(log.actions[1]?.resolve?.requestActionId).toEqual(0);
      expect(log.actions[1]?.resolve?.requestDuration).toBeGreaterThan(8);
      done();
    }
  });
});


test("scaffolding results are logged", (done) => {

  const thread1 = scenario({id: 'thread1', description: 'myThread1'}, function* () {
      yield bp.askFor('heyho');
  });

  testScenarios((enable) => {
      enable(thread1());
  }, ({log, thread}) => {
    if(thread.get({name: 'thread1'})?.bids?.askFor.get({name: 'heyho'})) {
      const history = log.bThreadScaffoldingHistory.get('thread1');
      expect(history!.get(0)).toEqual(ScaffoldingResultType.enabled);
      done();
    }
  });
});

test("pending events are logged", (done) => {

  const thread1 = scenario({id: 'thread1', description: 'myThread1'}, function* () {
      yield bp.request('request1', delay(10));
  });

  testScenarios((enable) => {
      enable(thread1());
  }, ({log, thread}) => {
    if(thread.get({name: 'thread1'})?.isCompleted) {
      const history = log.bThreadReactionHistory.get('thread1');
      expect(history?.size).toEqual(2);
      done();

    }
  });
});