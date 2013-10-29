
describe('tests', function() {
  describe('HtmlSizer', function() {
    it('calculates a size of a W correctly', function() {
      var parentEl = document.createElement('div');
      document.body.appendChild(parentEl);
      var htmlSizer = new HtmlSizer(parentEl);
      expect(htmlSizer.size('W')).toEqual([15, 18]);
    });

    it('calls size when width is called', function() {
      var parentEl = document.createElement('div');
      document.body.appendChild(parentEl);
      var htmlSizer = new HtmlSizer(parentEl);
      spyOn(htmlSizer, 'size');
      htmlSizer.width('hi');
      expect(htmlSizer.size('W')).toHaveBeenCalled();
    });
  });
});
