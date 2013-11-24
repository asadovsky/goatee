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
    spyOn(htmlSizer, 'size').andCallThrough();
    htmlSizer.width('hi');
    expect(htmlSizer.size).toHaveBeenCalledWith('hi');
  });
});
